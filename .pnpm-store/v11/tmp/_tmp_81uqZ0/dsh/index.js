// DeepSeek Harness (dsh) plugin: registers a modlens_read_image tool backed
// by the modlens CLI that ships in this very package. dsh models are
// text-only, so the tool is the vision bridge; unlike prompt-triggered
// skills, a registered tool schema reaches the model on every request, so
// there is no trigger gamble. The name is ours rather than the host's
// `read_image` (see the registration in apply, and issue #34).
// The engine is spawned from ../dist/main.js inside this package:
// no PATH lookup, no npx, the plugin and its engine version-lock together.
//
// Loaded via the cordis.patch.yml row `@liustack/modlens/dsh` (see the
// package.json `dsh.bundle` manifest). Providers, reuse grants, and guard
// rules keep living in ~/.modlens/config.json, shared with every harness.
import { spawn } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI_PATH = fileURLToPath(new URL('../dist/main.js', import.meta.url))
// Kept in lockstep with src/schema.ts by a repo test; the plugin file cannot
// import the TS source and stays fully dependency-free (node builtins only).
const OUTPUT_SCHEMA = JSON.parse(readFileSync(new URL('./vision-schema.json', import.meta.url), 'utf8'))

const CLI_TIMEOUT_MS = 180_000

export const name = 'modlens'
export const inject = ['tools', 'agents', 'attachments', 'llm']

export const MEDIA_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
}

export function apply(ctx, config = {}) {
  // Off by default since the vision provider converts at request time and
  // keeps the durable log (and the UI thumbnail) intact; turn it on only for
  // setups where images enter through a provider this plugin does not wrap.
  if (config.autoRead === true) {
    registerAutoRead(ctx)
  }
  // The provider ids this plugin registered itself. The takeover verdict has
  // to skip them: our wrapper models are synthetic twins of upstream ones,
  // carrying the upstream id and declaring image input, so a plain text-only
  // label matches the twin and the twin's declaration vetoes the takeover
  // that label deserved (issue #36). Filled by registerVisionProvider as
  // wrappers land, including the later sweeps, and read by the verdict.
  const ownProviders = new Set()
  if (config.visionProvider !== false) {
    registerVisionProvider(ctx, config, ownProviders)
  }
  // Paste-to-path: the browser half (dsh/client.js) intercepts image pastes
  // and POSTs the bytes here; the file lands in a private temp dir and the
  // path text goes into the composer instead of an image attachment. A
  // text-only model then never trips image admission, and the path is the
  // same trigger shape Pi, OpenCode, and Claude Code hand their models.
  // webServer exists only under the web profile, and this cordis has no
  // optional-inject form, so the route rides a scoped ctx.inject: the closure
  // runs when the service appears and never runs where it does not (headless
  // stays untouched, and the plugin itself never waits on it).
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      if (config.pasteToPath !== false) {
        try {
          // scope carries webServer; the plugin's own ctx carries llm for the
          // takeover verdicts.
          registerPasteRoute(scope, ctx, ownProviders)
        } catch (error) {
          console.error(`[modlens] paste-to-path route skipped: ${error}`)
        }
      }
      // Same web server, a separate switch: turning paste-to-path off is a
      // statement about how images enter, not about whether the engine can
      // be configured. dsh's own settings surface renders a hardcoded set of
      // cards and does not enumerate namespaces, so the card the browser half
      // contributes talks to this route rather than to a settings schema
      // (issue #39).
      if (config.settingsCard !== false) {
        try {
          registerConfigRoute(scope)
        } catch (error) {
          console.error(`[modlens] settings card route skipped: ${error}`)
        }
      }
    })
  }
  // Registered as a raw JSON-Schema tool definition (no dsh package imports:
  // the developer-preview registry accepts these and out-of-tree resolution
  // of @deepseek-ai/dsh-tools is not yet reliable), so this plugin owns its
  // own argument validation inside execute.
  //
  // The name is ours by default (see the registration below): hosts with a
  // durable attachment store mount their own native read_image (dsh-tool-fs),
  // which is gated on the model declaring image input and so refuses the
  // text-only models this plugin exists for. Any registration error degrades
  // loudly instead of taking the vision wrapper down with it (issue #21).
  const readImageTool = (toolName) => ({
    name: toolName,
    description:
      'Read an image through the modlens vision bridge. Use whenever a message references an image the current model cannot see: a local file path or an http(s) URL to a screenshot, photo, chart, diagram, or document scan. Returns structured evidence with every word transcribed (ocr.full_text), layout regions in reading order, semantics, and an uncertainty list; quote the evidence instead of guessing. Requires a configured modlens engine (run `npx @liustack/modlens doctor` in a terminal to check).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute local file path or http(s) URL of the image',
        },
        prompt: {
          type: 'string',
          description: 'Optional extra focus for the reading (e.g. "focus on the axis labels")',
        },
      },
      required: ['path'],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderEvidence(value) }],
    },
    // The CLI enforces its own deadline; this is the cooperative backstop.
    timeoutMs: CLI_TIMEOUT_MS + 20_000,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({
      card: 'generic',
      title: toolName,
      kind: 'read',
      rawInput: args,
      ...(typeof args?.path === 'string' && !/^https?:\/\//i.test(args.path)
        ? { locations: [{ path: args.path }] }
        : {}),
    }),
    async execute(args, exec) {
      if (typeof args?.path !== 'string' || args.path.trim() === '') {
        throw new Error(`${toolName} needs a non-empty string "path".`)
      }
      const cliArgs = [CLI_PATH, '-i', args.path, '--timeout', String(CLI_TIMEOUT_MS)]
      if (args.prompt) {
        cliArgs.push('--prompt', args.prompt)
      }
      const { stdout, stderr, code } = await run(process.execPath, cliArgs, exec.signal)
      if (code !== 0) {
        throw new Error(`modlens failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 500)}`)
      }
      let parsed
      try {
        parsed = JSON.parse(stdout)
      } catch {
        throw new Error(`modlens produced no JSON: ${stdout.trim().slice(0, 300)}`)
      }
      // The canonical value is the vision result itself; routing details
      // (meta.attempts, whose quota a reused engine spent) stay operational.
      return parsed.result
    },
  })
  // A name of our own rather than the host's. dsh's registry is layered and
  // a scoped tool shadows a global one, so a host `read_image` mounted in the
  // agent-preset scope and ours registered globally are not a duplicate at
  // all: the registration succeeds, nothing throws, and the model still
  // resolves the host's (issue #34). Detecting that from here would mean
  // walking every agent (`agents.list()` plus `agent/created`) and asking
  // `tools.get(name, agent)` per scope, then mutating a global catalog per
  // agent. Not entering the collision is cheaper: no host tool is known to
  // use this name, and the model finds ours through its schema, which reaches
  // it on every request regardless of what the tool is called. `toolName`
  // still pins whatever a host prefers.
  const preferred = config.toolName || 'modlens_read_image'
  try {
    ctx.tools.register(readImageTool(preferred))
  } catch (error) {
    // Same-layer duplicate of the chosen name, or a preview-era surface
    // change: degrade loudly instead of taking the whole plugin down.
    console.error(`[modlens] ${preferred} registration skipped: ${error}`)
  }
}

// Image magic bytes for the paste route: refuse anything that is not a real
// image before a byte touches disk. Mirrors the CLI's sniffing table
// (src/imageInput.ts SNIFFERS) signature for signature: full PNG magic, both
// GIF variants, and ftyp only with a known heic/heif brand — a generic BMFF
// (`ftypmp42`, plain video) must not be saved as an image.
const PASTE_SNIFFS = [
  {
    ext: '.png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  { ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: '.gif',
    test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)),
  },
  {
    ext: '.webp',
    test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    ext: '.heic',
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 4, 8) === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'hevx'].includes(b.toString('ascii', 8, 12)),
  },
  {
    ext: '.heif',
    test: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 4, 8) === 'ftyp' &&
      ['mif1', 'msf1', 'heif'].includes(b.toString('ascii', 8, 12)),
  },
]
const PASTE_MAX_BYTES = 25 * 1024 * 1024

/**
 * Should the browser take a paste over for the model behind this selector
 * label? Decided here, not in the browser, because only the host holds the
 * structured model metadata: a name regex in the client called every vision
 * model it did not recognize text-only and hijacked its native paste.
 *
 * The label carries no provider id, only prose plus a display name, so the
 * host cannot know WHICH matching model is selected: a longest-match pick
 * was still hijackable (a text route named "Current Pro" outscored a selected
 * vision model named "Pro", because the label's own "current" prose completed
 * the longer name). So no picking at all: the answer is true only when EVERY
 * model whose name or id appears in the label is positively confirmed
 * text-only. One image-capable match anywhere vetoes; a model with no
 * declared inputModalities is UNKNOWN, not text-only; and a provider whose
 * catalog cannot be read is unknown too, a veto rather than a shrug, since the
 * unreadable route is exactly where the vision twin could live. Anything
 * unresolvable answers false: the native path is the safe default, and a
 * text-only model merely keeps its old error message.
 */
// The provider ids registerVisionProvider mints: the legacy deepseek wrap and
// the `modlens-<upstream>` form auto-discovery uses. A sibling instance of
// this plugin derives its ids the same way, which is what makes the pair of
// checks below meaningful. A custom `config.providerId` is outside the
// convention on purpose and is covered by the registered-id set instead.
const OWN_PROVIDER_ID = /^(deepseek-modlens$|modlens-)/

async function pasteTakeoverVerdict(host, label, ownProviders) {
  if (typeof label !== 'string' || label.trim() === '') return false
  // Our own wrappers convert pastes at request time with the thumbnail
  // preserved; taking their paste over would defeat the better path.
  if (/\(modlens vision\)/i.test(label)) return false
  const llm = host.llm
  if (!llm || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') {
    return false
  }
  const lowered = label.toLowerCase()
  let matchedAny = false
  for (const info of llm.listProviders()) {
    const providerId = info?.id
    if (!providerId) continue
    // Our own wrapper: every model in it is a synthetic twin of an upstream
    // one, carrying that upstream id and declaring image input because that
    // is how the wrapper unlocks admission. Scanning it means a plain
    // text-only label matches the twin by id and the twin vetoes the
    // takeover the real model deserved (issue #36). Only ids this plugin
    // registered itself are skipped, so a real vision provider, including
    // one that happens to be named like ours, still votes.
    if (ownProviders?.has(providerId)) continue
    let models = []
    try {
      models = await llm.listModels(providerId)
    } catch {
      return false
    }
    for (const model of models) {
      // A twin from another instance of this plugin, which the set above
      // cannot know about: a second apply() in the same process hits the
      // duplicate branch, does not claim the id, and would otherwise be
      // vetoed by the first instance's wrapper. Both halves are required.
      // The name marker alone proves nothing, since any provider can put that
      // string in a model name and would then slip past a veto it deserves;
      // the id is what makes it ours, because a sibling instance derives its
      // provider id from the same rule this one does.
      if (
        OWN_PROVIDER_ID.test(providerId) &&
        typeof model?.name === 'string' &&
        /\(modlens vision\)/i.test(model.name)
      ) {
        continue
      }
      for (const candidate of [model?.name, model?.id]) {
        if (typeof candidate !== 'string' || candidate.length === 0) continue
        if (!lowered.includes(candidate.toLowerCase())) continue
        // The veto has no length floor: a vision model named "AI" appears in
        // the label just as legitimately as a long name does, and skipping
        // short names let a longer text-only name confirm the takeover alone.
        const modalities = model?.inputModalities
        if (!Array.isArray(modalities) || modalities.includes('image')) {
          return false
        }
        // Positive confirmation does have a floor: one- and two-character
        // text-only names match label prose far too easily to identify the
        // selected model.
        if (candidate.length >= 3) {
          matchedAny = true
        }
      }
    }
  }
  return matchedAny
}

// Verdicts are stable for the lifetime of a model route but the inventory can
// grow (llm-pi-ai mounts after settings load), so cache briefly, not forever.
const PASTE_VERDICT_TTL_MS = 15_000
const PASTE_VERDICT_CAP = 32

/**
 * The paste route. POST /modlens/paste: image bytes in, `{ path }` out; the
 * file is private (0600) in a fresh unpredictable temp dir, magic-byte
 * checked and size-capped. GET /modlens/paste?model=<selector label>:
 * `{ takeover }`: the browser half asks before ever touching a paste, so a
 * disabled route (pasteToPath: false, or no web profile) means the client
 * stands down instead of swallowing pastes into a 404. Bound to the dsh web
 * server, which listens on loopback by default.
 */
function registerPasteRoute(ctx, host, ownProviders) {
  const verdicts = new Map()
  // The cache key is only the selector label, which cannot tell two
  // same-named models on different routes apart. A route mounting mid-TTL
  // (llm-pi-ai lands after settings load) could therefore serve a stale
  // verdict computed before its vision twin existed, so every topology
  // change empties the cache at exactly the boundary that invalidates it.
  // The epoch guards the async gap the clear cannot reach: a verdict whose
  // computation STARTED before the event describes a registry that no longer
  // exists, and without the counter it was written back into the just-
  // emptied cache and served for a full TTL.
  let topologyEpoch = 0
  if (typeof host.on === 'function') {
    host.on('llm/adapters-updated', () => {
      topologyEpoch += 1
      verdicts.clear()
    })
  }
  ctx.webServer.register({
    name: 'modlens-paste',
    kind: 'exact',
    path: '/modlens/paste',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        try {
          const label = new URL(req.url, 'http://localhost').searchParams.get('model') ?? ''
          const cached = verdicts.get(label)
          let takeover
          if (cached && Date.now() - cached.at < PASTE_VERDICT_TTL_MS) {
            takeover = cached.takeover
          } else {
            // Recompute while the topology moves under the computation: an
            // answer read from a pre-event registry snapshot must be neither
            // cached nor served. Bounded, and the give-up answer is the
            // conservative one.
            let attempts = 0
            for (;;) {
              const startedEpoch = topologyEpoch
              takeover = await pasteTakeoverVerdict(host, label, ownProviders)
              if (topologyEpoch === startedEpoch) {
                verdicts.delete(label)
                verdicts.set(label, { takeover, at: Date.now() })
                if (verdicts.size > PASTE_VERDICT_CAP) {
                  verdicts.delete(verdicts.keys().next().value)
                }
                break
              }
              attempts += 1
              if (attempts >= 3) {
                takeover = false
                break
              }
            }
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ takeover }))
        } catch (error) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: String(error?.message ?? error) }))
        }
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      try {
        const chunks = []
        let total = 0
        for await (const chunk of req) {
          total += chunk.length
          if (total > PASTE_MAX_BYTES) {
            res.writeHead(413, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: `image over the ${PASTE_MAX_BYTES}-byte limit` }))
            req.destroy()
            return
          }
          chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)
        const sniff = PASTE_SNIFFS.find((s) => s.test(buffer))
        if (!sniff) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'not a recognized image (png/jpeg/gif/webp/heic)' }))
          return
        }
        const { mkdtemp, writeFile } = await import('node:fs/promises')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        const dir = await mkdtemp(join(tmpdir(), 'modlens-dsh-paste-'))
        const file = join(dir, `paste${sniff.ext}`)
        await writeFile(file, buffer, { mode: 0o600 })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ path: file }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(error?.message ? error.message : error) }))
      }
    },
  })
}

/**
 * Phase 3: the paste unlock. dsh's image admission asks the selected
 * provider's adapter for inputModalities, and the DeepSeek adapter hardcodes
 * text-only, so pastes are refused before any plugin hook runs. This wrapper
 * registers a NEW provider whose model metadata declares image input and
 * whose stream() is a one-line delegation back to the real route. Pick the
 * wrapped model in the model selector, paste, and the request-time rewrite
 * turns the image into evidence text before the delegated request goes out;
 * the upstream serializer's own image rejection stays as the fail-closed
 * backstop. Guarded feature-detection: if the llm registration surface moved
 * (developer preview), the plugin quietly stays a read-only-tool plugin.
 *
 * Two modes (issue #29, design contributed by @zlycode01):
 * - `config.upstream` set: wrap exactly that one route, legacy behavior.
 * - unset: auto-discovery — every registered provider route carrying
 *   wrappable text-only family models gets its own `modlens-<provider>`
 *   wrapper, so a machine with several subscription packages (opencode-go,
 *   zai, ...) wraps them all instead of hand-picking one. A `discover` array
 *   of provider ids narrows the set. Routes that register late (llm-pi-ai
 *   mounts its routes after settings load) are picked up by re-sweeping on
 *   the registry's own `llm/adapters-updated` notification, no polling. The
 *   deepseek-official wrap keeps its historical `deepseek-modlens` id, so a
 *   selector remembering that provider survives the upgrade.
 */
function registerVisionProvider(ctx, config, ownProviders) {
  // Wrap only the text-only members of these families. Their own vision
  // models (present or future: deepseek-vl/ocr/janus, glm-4.5v, glm-5v-...)
  // need no bridge and are excluded by name and by declared modality.
  const families = config.families || ['deepseek', 'glm']
  const VISION_ID = /(deepseek-(vl|ocr)|janus|glm-[\d.]*v(\b|-))/i
  const shouldWrap = (info) => {
    const id = String(info?.id ?? '').toLowerCase()
    if (!families.some((family) => id.startsWith(family))) return false
    if (VISION_ID.test(id)) return false
    if (Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')) return false
    return true
  }
  if (typeof ctx.llm?.registerAdapter !== 'function' || typeof ctx.llm?.stream !== 'function') {
    return
  }

  const registerWrapper = (upstream, providerId, displayName) => {
    const withVision = (info) => ({
      ...info,
      provider: providerId,
      inputModalities: ['text', 'image'],
    })
    try {
      ctx.llm.registerAdapter([providerId], {
        // Duck-typing LlmAdapter: providerInfo/providerRetryPolicy are
        // base-class defaults a plain object must supply itself (their
        // absence is exactly the silent registration failure this catch
        // used to swallow).
        providerInfo(provider) {
          return { id: provider, name: displayName }
        },
        providerRetryPolicy() {
          return undefined
        },
        async listModels(_provider, signal) {
          try {
            const models = await ctx.llm.listModels(upstream, signal)
            return models.filter(shouldWrap).map((model) => ({
              ...withVision(model),
              name: `${model.name ?? model.id} (modlens vision)`,
            }))
          } catch {
            return []
          }
        },
        async resolveModel(_provider, model, signal) {
          const info = await ctx.llm.resolveModelInfo(upstream, model, signal)
          if (!shouldWrap(info)) {
            throw new Error(`model "${model}" is outside the modlens vision wrap scope`)
          }
          return { ...withVision(info), id: model }
        },
        stream(options) {
          // Convert at request time, not at log time: the durable session
          // log keeps the real image blocks (so the UI shows the paste
          // natively), and only the wire messages carry evidence text.
          // Cached per attachment, since the same history rides every step.
          const self = this
          return (async function* () {
            const messages = await convertImagesToEvidence(ctx, options.messages, options.signal, self)
            yield* ctx.llm.stream({ ...options, provider: upstream, messages })
          })()
        },
        evidenceCache: new Map(),
      })
      // Trusted as ours only on a registration this call actually made. A
      // duplicate below means someone else holds that id, and skipping a
      // provider we do not own would let a real vision model's paste be
      // taken over, which is the bug the verdict exists to prevent.
      ownProviders?.add(providerId)
      return true
    } catch (error) {
      // A duplicate means a concurrent or earlier registration already won:
      // that is success for the claim, not a reason to retry forever.
      if (/already|duplicate/i.test(String(error))) {
        console.error(`[modlens] vision provider ${providerId} already registered, keeping the existing one`)
        return true
      }
      // A preview-era surface change: degrade to the tool-only plugin,
      // but say so in the harness log instead of vanishing (a swallowed
      // TypeError here once hid a missing base method).
      console.error(`[modlens] vision provider registration skipped (${providerId}): ${error}`)
      return false
    }
  }

  if (config.upstream) {
    registerWrapper(config.upstream, config.providerId || 'deepseek-modlens', 'DeepSeek (modlens vision)')
    return
  }

  // Auto-discovery. `wrapped` guards duplicates across sweeps and the
  // self-nesting case (our own wrappers appear in listProviders too). Two
  // re-entrancy rules matter because registerAdapter itself broadcasts
  // llm/adapters-updated, so every successful wrap re-triggers a sweep:
  // an id is claimed in `wrapped` BEFORE any await (a concurrent sweep must
  // skip it while this one is still probing), and sweeps are serialized on
  // one promise chain so two can never interleave their probes at all.
  const discover = Array.isArray(config.discover) ? new Set(config.discover) : null
  const wrapped = new Set(['deepseek-modlens'])
  const sweepOnce = async () => {
    try {
      await sweepBody()
    } catch (error) {
      // A sweep failure must never become an unhandled rejection inside the
      // host process; the next topology notification simply tries again.
      console.error(`[modlens] vision provider discovery sweep failed: ${error}`)
    }
  }
  const sweepBody = async () => {
    if (typeof ctx.llm.listProviders !== 'function') {
      // Older registry surface: fall back to the single legacy wrap once.
      if (!wrapped.has('__legacy_fallback__')) {
        wrapped.add('__legacy_fallback__')
        registerWrapper('deepseek-official', 'deepseek-modlens', 'DeepSeek (modlens vision)')
      }
      return
    }
    for (const info of ctx.llm.listProviders()) {
      const id = info?.id
      if (!id || wrapped.has(id) || String(id).startsWith('modlens-')) continue
      if (discover && !discover.has(id)) continue
      // Claim before the await: the probe may suspend, and the sweep a
      // registration triggers must not probe the same id concurrently.
      wrapped.add(id)
      let models = []
      try {
        models = await ctx.llm.listModels(id)
      } catch {
        // Unreachable route today; release the claim so a later topology
        // change retries it.
        wrapped.delete(id)
        continue
      }
      if (!models.some(shouldWrap)) {
        // No eligible models yet: release, the route may gain some later.
        wrapped.delete(id)
        continue
      }
      const providerId = id === 'deepseek-official' ? 'deepseek-modlens' : `modlens-${id}`
      const base = info.name ?? id
      if (!registerWrapper(id, providerId, `${base} (modlens vision)`)) {
        wrapped.delete(id)
      }
    }
  }
  // Serialize: a sweep triggered mid-sweep runs after, never interleaved.
  // The first sweep is invoked directly so its synchronous prefix (the
  // legacy fallback, the pre-await claims) completes during apply().
  let sweeping = sweepOnce()
  const sweep = () => {
    sweeping = sweeping.then(sweepOnce, sweepOnce)
    return sweeping
  }
  if (typeof ctx.on === 'function') {
    ctx.on('llm/adapters-updated', () => {
      void sweep()
    })
  }
}

// The same pasted attachment rides every later step of its session, but the
// cache must never make a failure permanent or run the engine twice for
// concurrent steps. So it stores promises (concurrent readers join the first
// run), evicts failed reads on settle (a fixed config gets a fresh chance),
// and caps itself LRU-style so a long-lived Web profile cannot hoard
// evidence text forever.
const EVIDENCE_CACHE_LIMIT = 64

function cachedEvidence(ctx, adapter, block) {
  const key = JSON.stringify(block.attachment ?? block)
  const hit = adapter.evidenceCache.get(key)
  if (hit !== undefined) {
    // Refresh recency: Map iteration order is insertion order.
    adapter.evidenceCache.delete(key)
    adapter.evidenceCache.set(key, hit)
    return hit
  }
  // Deliberately no caller signal: a shared entry must not die with its first
  // caller (their abort used to cancel every concurrent joiner). A cancelled
  // caller simply stops awaiting; the read finishes and the cache keeps it.
  const pending = readImageBlock(ctx, block, undefined).then(
    (evidence) => {
      // Only evict our own entry: this promise may have been LRU-evicted and
      // the key re-populated by a newer read meanwhile.
      if (!evidence.ok && adapter.evidenceCache.get(key) === pending) {
        adapter.evidenceCache.delete(key)
      }
      return evidence.block
    },
    (error) => {
      // readImageBlock never rejects by contract; this is the belt for a
      // future refactor breaking that, so a rejected promise cannot lodge in
      // the cache forever.
      if (adapter.evidenceCache.get(key) === pending) {
        adapter.evidenceCache.delete(key)
      }
      return {
        type: 'text',
        text: `[A pasted image could not be read by modlens: ${
          error instanceof Error ? error.message.slice(0, 300) : String(error)
        }]`,
      }
    },
  )
  adapter.evidenceCache.set(key, pending)
  while (adapter.evidenceCache.size > EVIDENCE_CACHE_LIMIT) {
    adapter.evidenceCache.delete(adapter.evidenceCache.keys().next().value)
  }
  return pending
}

/**
 * Wait on a shared promise without inheriting its lifetime: the caller's
 * abort rejects THIS wait immediately, while the underlying read keeps
 * running and lands in the cache for the retry.
 */
function abortableWait(promise, signal) {
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const onAbort = () => reject(signal.reason ?? new Error('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * Image blocks hide at two depths: top-level message content (pastes), and
 * inside tool-result content (dsh's own read_image tool nests one there).
 * The upstream adapter's rejection check recurses (issue #24), so the
 * conversion must recurse the same way or a nested image wedges the session
 * permanently — the durable log keeps the real block, and every later turn
 * re-fails on it.
 */
function contentHasImage(blocks) {
  return (
    Array.isArray(blocks) &&
    blocks.some((b) => b?.type === 'image' || (b?.type === 'tool-result' && contentHasImage(b.content)))
  )
}

async function convertBlocks(blocks, convertOne) {
  const out = []
  for (const block of blocks) {
    if (block?.type === 'image') {
      out.push(await convertOne(block))
    } else if (block?.type === 'tool-result' && contentHasImage(block.content)) {
      out.push({ ...block, content: await convertBlocks(block.content, convertOne) })
    } else {
      out.push(block)
    }
  }
  return out
}

async function convertImagesToEvidence(ctx, messages, signal, adapter) {
  const out = []
  for (const message of messages) {
    if (!contentHasImage(message.content)) {
      out.push(message)
      continue
    }
    const content = await convertBlocks(message.content, (block) =>
      abortableWait(cachedEvidence(ctx, adapter, block), signal),
    )
    out.push({ ...message, content })
  }
  return out
}

/**
 * Phase 2: paste auto-route. When entered messages carry image blocks (the
 * Web UI's paste/drop intake) and the model behind dsh is text-only, rewrite
 * each image block into a modlens evidence text block before the step starts.
 * Runs after `next()` so downstream pre-step listeners (compaction, context
 * injectors) see and shape the same final message set; a failed read degrades
 * to an explanatory text block instead of rejecting the step.
 */
function registerAutoRead(ctx) {
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') {
      return decision
    }
    if (!decision.messages.some((message) => contentHasImage(message.content))) {
      return decision
    }
    const messages = []
    for (const message of decision.messages) {
      if (!contentHasImage(message.content)) {
        messages.push(message)
        continue
      }
      const content = await convertBlocks(
        message.content,
        async (block) => (await readImageBlock(ctx, block, payload.signal)).block,
      )
      messages.push({ ...message, content })
    }
    return { kind: 'enter', messages }
  })
}

/**
 * Read one image block into an evidence text block. Never throws: failures
 * degrade to an explanatory block with `ok: false`, so callers can decide
 * what a failure means (the pre-step keeps the step going, the cache refuses
 * to memoize it).
 */
async function readImageBlock(ctx, block, signal) {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  let dir
  try {
    // StoredImageAttachment carries { ref, data: Uint8Array }; the media type
    // rides the reference (verified against dsh attachment/src/types.ts).
    const stored = await ctx.attachments.readImage(block.attachment, signal)
    if (!stored?.data) {
      // Named failure instead of Buffer.from(undefined)'s bare TypeError the
      // next time a developer-preview release moves the field (issue #17).
      throw new Error("attachments.readImage returned no 'data' bytes; the dsh attachment shape may have changed")
    }
    const mediaType = stored.ref?.mediaType ?? block.attachment?.mediaType
    const ext = MEDIA_EXT[mediaType]
    if (!ext) {
      // Refusing beats disguising: a fake .png suffix would make the CLI (and
      // the provider behind it) judge mislabelled bytes.
      throw new Error(`unsupported pasted media type ${mediaType ?? '(none declared)'}`)
    }
    dir = await mkdtemp(join(tmpdir(), 'modlens-dsh-'))
    const file = join(dir, `paste${ext}`)
    await writeFile(file, Buffer.from(stored.data), { mode: 0o600 })
    const cli = process.env.MODLENS_DSH_CLI || CLI_PATH
    const { stdout, stderr, code } = await run(
      process.execPath,
      [cli, '-i', file, '--timeout', String(CLI_TIMEOUT_MS)],
      signal,
    )
    if (code !== 0) {
      throw new Error((stderr || stdout).trim().slice(0, 300))
    }
    const parsed = JSON.parse(stdout)
    return {
      ok: true,
      block: {
        type: 'text',
        text: `[Pasted image, read by the modlens vision bridge]\n${renderEvidence(parsed.result)}`,
      },
    }
  } catch (error) {
    return {
      ok: false,
      block: {
        type: 'text',
        text: `[A pasted image could not be read by modlens: ${
          error instanceof Error ? error.message.slice(0, 300) : String(error)
        }. Tell the user, and suggest running \`npx @liustack/modlens doctor\`.]`,
      },
    }
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

function run(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      // In the packaged desktop app process.execPath is the Electron binary;
      // this makes it behave as plain node for the spawned CLI (issue #25).
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, code }))
  })
}

function renderEvidence(value) {
  const lines = [value.summary]
  const text = value.ocr?.full_text?.trim()
  if (text) {
    lines.push('', 'Transcription:', text.length > 4000 ? `${text.slice(0, 4000)}…` : text)
  }
  const uncertainty = value.uncertainty ?? []
  if (uncertainty.length > 0) {
    lines.push('', `Uncertain: ${uncertainty.join('; ')}`)
  }
  return lines.join('\n')
}

// The engines a user can pick in the settings card, in the order the docs
// introduce them. Kept to the names modlens itself uses so the card and
// `modlens doctor` say the same words.
const ENGINES = ['antigravity-cli', 'gemini-api', 'openai', 'anthropic', 'claude-cli']
// The two CLI engines sign in through their own tool, so a key or an endpoint
// would be a field with nothing behind it. Both still take a model.
const KEYLESS_ENGINES = ['antigravity-cli', 'claude-cli']
// Every accepted spelling, mirroring src/providers/index.ts. Settings saved
// under an alias are the same engine's settings, and a provider pinned by an
// alias is pinned to that engine: showing either as something else would put
// the card at odds with what actually reads the images.
const ENGINE_ALIASES = {
  antigravity: 'antigravity-cli',
  agy: 'antigravity-cli',
  gemini: 'gemini-api',
  'openai-compat': 'openai',
  claude: 'anthropic',
  'claude-code': 'claude-cli',
}

/** The canonical engine a stored name means, or '' when it names none. */
function canonicalEngine(name) {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim().toLowerCase()
  if (ENGINES.includes(trimmed)) return trimmed
  return ENGINE_ALIASES[trimmed] ?? ''
}

/** The config keys holding one engine's settings: its own, plus its aliases. */
function settingsKeysFor(engine) {
  const aliases = Object.keys(ENGINE_ALIASES).filter((alias) => ENGINE_ALIASES[alias] === engine)
  return [...aliases, engine]
}
// Auto mode: the local harnesses whose logins a read may borrow. `claude`
// absent counts as granted, since claude-cli predates the grant model.
const REUSE_HARNESSES = ['claude', 'codex', 'opencode', 'pi', 'grok']

/** ~/.modlens/config.json, the one file every harness shares. */
function modlensConfigPath() {
  return join(homedir(), '.modlens', 'config.json')
}

/**
 * The shared config, or a thrown error. Only a missing file reads as empty:
 * a file that exists but cannot be parsed or read is somebody's configuration,
 * and a settings card that treated it as empty would overwrite it on the next
 * save. The card shows the error instead.
 */
function readModlensConfig() {
  let raw
  try {
    raw = readFileSync(modlensConfigPath(), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new Error(`cannot read ${modlensConfigPath()}: ${error?.message ?? error}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${modlensConfigPath()} is not valid JSON: ${error?.message ?? error}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${modlensConfigPath()} does not hold a JSON object`)
  }
  return parsed
}

/**
 * What the card is allowed to know. Every engine's endpoint and model, plus
 * whether a key is stored, and never the key itself: a browser that cannot
 * read a secret cannot leak one, and cannot write it back either.
 */
function engineSummary(config = readModlensConfig()) {
  const engines = {}
  for (const name of ENGINES) {
    // Alias first, canonical last: the canonical key wins on conflict, the
    // same order resolveProviderSettings uses.
    const settings = Object.assign({}, ...settingsKeysFor(name).map((key) => config.providers?.[key] ?? {}))
    engines[name] = {
      baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : '',
      model: typeof settings.model === 'string' ? settings.model : '',
      hasKey: typeof settings.apiKey === 'string' && settings.apiKey !== '',
    }
  }
  const reuse = {}
  for (const harness of REUSE_HARNESSES) {
    const granted = config.reuse?.[harness]
    reuse[harness] = typeof granted === 'boolean' ? granted : harness === 'claude'
  }
  // Three states, kept apart: pinned to an engine, pinned by one of its
  // aliases (reported canonically), or not pinned at all, which is its own
  // answer and means the failover chain decides. Collapsing the third into
  // the first pins an engine the user never chose.
  return {
    provider: canonicalEngine(config.provider),
    engines,
    keyless: KEYLESS_ENGINES,
    reuse,
  }
}

/**
 * Apply one card submission to the shared file. Only the named engine's own
 * three fields are touched, so switching engines in the card cannot copy one
 * engine's endpoint onto another. An absent or empty `apiKey` leaves the
 * stored one alone: the card never receives a key, so it must never be able
 * to clear one by submitting the blank field it was shown.
 */
function applyEngineSettings(patch) {
  const config = readModlensConfig()
  // The pin moves only when the card says it moved. A save that carried the
  // currently displayed engine regardless turned "not pinned" into a pin on
  // whatever happened to be shown, changing which engine reads every later
  // image without the user asking for it.
  if (patch?.provider !== undefined) {
    if (patch.provider === '') {
      delete config.provider
    } else if (ENGINES.includes(patch.provider)) {
      config.provider = patch.provider
    } else {
      throw new Error(`unknown engine: ${patch.provider}`)
    }
  }
  // Engine fields are edited one engine at a time, named by `engine`. Absent
  // means this save touched no engine settings, which is what a reuse-only
  // save looks like.
  const engine = patch?.engine
  if (engine !== undefined) {
    if (!ENGINES.includes(engine)) {
      throw new Error(`unknown engine: ${engine}`)
    }
    config.providers = { ...config.providers }
    // Write where this engine's settings already live, so a key saved under
    // an alias is updated rather than shadowed by a second copy.
    // Write where the read takes effect. settingsKeysFor merges aliases
    // first and the canonical key last, so the canonical value wins; picking
    // the first existing key instead wrote a new value underneath an older
    // canonical one, which saved successfully and changed nothing. Both CLI
    // spellings existing at once is ordinary: `config set gemini.apiKey`
    // then `config set gemini-api.apiKey` leaves exactly that.
    const holders = settingsKeysFor(engine).filter((key) => config.providers[key] !== undefined)
    const target = holders.length > 0 ? holders[holders.length - 1] : engine
    const settings = { ...config.providers[target] }
    for (const field of ['baseUrl', 'model']) {
      const value = typeof patch[field] === 'string' ? patch[field].trim() : ''
      if (value === '') {
        delete settings[field]
      } else {
        settings[field] = value
      }
    }
    const apiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : ''
    if (apiKey !== '') {
      settings.apiKey = apiKey
    }
    config.providers[target] = settings
  }
  // Auto mode, when the card sent it: only the harnesses this build knows,
  // only booleans, so an unexpected key cannot land in the shared file.
  if (patch?.reuse !== null && typeof patch?.reuse === 'object') {
    config.reuse = { ...config.reuse }
    for (const harness of REUSE_HARNESSES) {
      const granted = patch.reuse[harness]
      if (typeof granted === 'boolean') {
        config.reuse[harness] = granted
      }
    }
  }
  const file = modlensConfigPath()
  // A symlink here would write through to wherever it points, so it is
  // refused rather than followed: the CLI writes a real file, and anything
  // else is a setup this card should not silently honor.
  try {
    if (lstatSync(file).isSymbolicLink()) {
      throw new Error(`${file} is a symlink; edit the file it points at instead`)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows has no POSIX bits; the mode on the write above is all there is.
  }
}

/**
 * GET /modlens/config: the engine summary above. POST: one submission.
 *
 * The dsh web server listens on loopback, but a page in the same browser can
 * still reach it, so a write requires a same-origin request: a cross-site POST
 * could otherwise repoint someone's engine at an endpoint of its choosing.
 * A read is refused the same way for symmetry, though it carries no secret.
 */
/**
 * The self-check behind the card's auto-mode section: which local harnesses
 * exist to be borrowed at all. `doctor --json` already probes them without
 * network or quota, so the route spawns the CLI this package ships and lifts
 * its reuse section. Cached briefly, since one probe can take a second and
 * re-expanding the card should not re-pay it.
 */
const DISCOVERY_TTL_MS = 60_000
let discoveryCache = null
async function discoverReuse() {
  if (discoveryCache !== null && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.value
  }
  try {
    const { stdout, code } = await run(process.execPath, [CLI_PATH, 'doctor', '--json'], AbortSignal.timeout(30_000))
    if (code !== 0) return null
    const reuse = JSON.parse(stdout)?.reuse
    if (!reuse || !Array.isArray(reuse.probes)) return null
    // doctor names the harness claude-code; the grant key is claude.
    const probes = reuse.probes.map((probe) => ({
      harness: probe.harness === 'claude-code' ? 'claude' : probe.harness,
      cliFound: probe.cliFound === true,
      loggedIn: probe.loggedIn,
      cliPath: typeof probe.cliPath === 'string' ? probe.cliPath : '',
    }))
    discoveryCache = { at: Date.now(), value: probes }
    return probes
  } catch {
    return null
  }
}

/**
 * Open the shared config file in whatever the OS considers its editor. The
 * card's "open config file" link lands here: the path never has to be
 * explained to the user, they just get the file. Created empty first when
 * missing, so the editor has something to open.
 */
function openConfigFile() {
  const file = modlensConfigPath()
  try {
    lstatSync(file)
  } catch {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{}\n', { mode: 0o600 })
  }
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [file]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', file]]
        : ['xdg-open', [file]]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

/** localhost, ::1, or anything in 127/8, matching dsh's own /api fence. */
function isLoopbackHost(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/**
 * The same fence dsh puts in front of its own /api, for the same two
 * confused-deputy paths. Host is the header DNS rebinding cannot forge, so it
 * must name a loopback authority: a rebound page reaches this socket carrying
 * its own domain there. Origin and Sec-Fetch-Site then rule out a cross-site
 * page on the machine itself. A dsh serving a LAN address configures
 * trustedHosts for /api; this route stays loopback-only, since nothing about
 * editing an API key wants a wider door.
 */
function isTrustedRequest(req) {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function registerConfigRoute(ctx) {
  ctx.webServer.register({
    name: 'modlens-config',
    kind: 'exact',
    path: '/modlens/config',
    handler: async (req, res) => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      if (!isTrustedRequest(req)) {
        send(403, { error: 'request refused: this route answers same-origin loopback only' })
        return
      }
      if (req.method === 'GET') {
        try {
          const summary = engineSummary()
          const wantsDiscovery = new URL(req.url, 'http://localhost').searchParams.has('discover')
          if (wantsDiscovery) {
            // null when the probe failed: the card then falls back to the
            // plain grant list rather than showing nothing.
            summary.discovery = await discoverReuse()
          }
          send(200, summary)
        } catch (error) {
          send(409, { error: String(error?.message ?? error) })
        }
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      try {
        const chunks = []
        let total = 0
        for await (const chunk of req) {
          total += chunk.length
          if (total > 64 * 1024) {
            send(413, { error: 'config payload too large' })
            req.destroy()
            return
          }
          chunks.push(chunk)
        }
        const patch = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        // The card's "open config file" link: an action, not a setting.
        if (patch?.open === true) {
          openConfigFile()
          send(200, { opened: true })
          return
        }
        applyEngineSettings(patch)
        send(200, engineSummary())
      } catch (error) {
        send(400, { error: String(error?.message ?? error) })
      }
    },
  })
}
