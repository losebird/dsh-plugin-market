import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { discoverAuto } from './auto/discover.ts';
import { type AutoRouteOptions, reuseProviders } from './auto/routes.ts';
import { loadConfigFile, type ModlensConfig, resolveProviderSettings } from './config.ts';
import { providerChain } from './providers/availability.ts';
import {
    type ProviderFailureContext,
    type ProviderInvocation,
    type ProviderParsedOutput,
    resolveProvider,
    type VisionProvider,
} from './providers/index.ts';
import { missingSchemaFields, normalizeVisionResult } from './schema.ts';
import { redactSecrets } from './util/redact.ts';
import { resolveSpawnPlan } from './util/winExec.ts';

export interface AnalyzeOptions {
    input: string;
    provider?: string;
    model?: string;
    prompt?: string;
    timeoutMs?: number;
    providerBin?: string;
    workdir?: string;
    /** --extra-body: replaces the configured extraBody for this run. */
    extraBody?: Record<string, unknown>;
    config?: ModlensConfig;
    /** Auto-mode discovery overrides (home, env, discovery), mainly for tests. */
    autoOptions?: AutoRouteOptions;
}

export interface AnalyzeAttempt {
    provider: string;
    ok: boolean;
    durationSeconds: number;
    error?: string;
}

export interface AnalyzeResult {
    image: string;
    provider: string;
    result: unknown;
    meta: {
        generatedAt: string;
        model: string;
        conversationId: string | null;
        durationSeconds: number | null;
        usage: unknown | null;
        /** Every provider tried this run, in order, successes and failures. */
        attempts: AnalyzeAttempt[];
        /** Routing notices: failovers and what they mean for the answer. */
        warnings: string[];
    };
}

interface CommandResult {
    stdout: string;
    stderr: string;
}

interface ResolvedInput {
    source: string;
    kind: 'local' | 'remote';
}

const DEFAULT_TIMEOUT_MS = 180_000;
// Give the provider's own timeout a chance to fire first; SIGTERM is the backstop.
const KILL_GRACE_MS = 30_000;
// After the provider exits, how long to keep draining stdout before giving up
// on the pipe closing. Reset whenever more output arrives.
const DRAIN_GRACE_MS = 500;
// How long a killed child gets before SIGKILL.
const SIGKILL_GRACE_MS = 2_000;

export async function analyzeImage(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const resolvedInput = resolveInput(options.input);
    if (resolvedInput.kind === 'local') {
        validateInputFile(resolvedInput.source);
    }

    const config = options.config ?? loadConfigFile();
    // An explicit -p pins exactly one provider with no fallback (like
    // modsearch's -e). The providerBin test double pins the agent the same
    // way. Otherwise the failover chain: every provider that is set up on
    // this machine plus the borrowed routes the user granted, merged by
    // region so a borrowed engine gets speed-class placement, not priority.
    const chain = options.provider
        ? [resolveProvider(options.provider)]
        : options.providerBin
          ? [resolveProvider('antigravity-cli')]
          : composeChain(resolvedInput.kind, config, options.autoOptions);
    if (chain.length === 0) {
        throw new Error(
            'No vision provider is set up on this machine. Install Antigravity CLI (curl -fsSL https://antigravity.google/cli/install.sh | bash, then run agy once to sign in), or configure a key: modlens config set gemini-api.apiKey <key>. Run modlens doctor for the full picture.' +
                reuseHint(config, options.autoOptions),
        );
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const attempts: AnalyzeAttempt[] = [];
    const warnings: string[] = [];
    let lastError: unknown;

    for (const provider of chain) {
        const startedAt = Date.now();
        // An explicit -m names one provider's model, so it applies to the
        // first attempt only; a failover provider runs its own default, since
        // model names do not carry across providers.
        const model =
            (attempts.length === 0 ? options.model : undefined) ||
            resolveProviderSettings(provider.name, config).model ||
            provider.defaultModel;
        try {
            const parsed = await runProvider(
                provider,
                model,
                options,
                resolvedInput,
                timeoutMs,
                config,
                warnings,
            );
            attempts.push({
                provider: provider.name,
                ok: true,
                durationSeconds: (Date.now() - startedAt) / 1000,
            });
            if (provider.reuseNote) {
                warnings.push(provider.reuseNote);
            }
            if (attempts.length > 1) {
                const failed = attempts.slice(0, -1);
                warnings.push(
                    `Failed over to ${provider.name} after: ${failed
                        .map((attempt) => `${attempt.provider} (${attempt.error})`)
                        .join('; ')}.`,
                );
                if (options.model) {
                    warnings.push(
                        `The explicit model applied to ${failed[0].provider} only; ${provider.name} ran its own default.`,
                    );
                }
            }
            return {
                image: resolvedInput.source,
                provider: provider.name,
                result: parsed.result,
                meta: {
                    generatedAt: new Date().toISOString(),
                    model,
                    conversationId: parsed.meta.conversationId,
                    durationSeconds: parsed.meta.durationSeconds,
                    usage: parsed.meta.usage,
                    attempts,
                    warnings,
                },
            };
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            attempts.push({
                provider: provider.name,
                ok: false,
                durationSeconds: (Date.now() - startedAt) / 1000,
                // Providers redact their own errors, but attempts travel into
                // output and model contexts, so the record gets the belt too.
                error: redactSecrets(message).slice(0, 300),
            });
        }
    }

    // A pinned or lone provider keeps its original, actionable error (agy's
    // sign-in guidance, a provider's own fix text). Only a real multi-provider
    // exhaustion gets the aggregate.
    if (chain.length === 1) {
        // A pinned provider keeps its error untouched; a lone auto-assembled
        // provider still deserves the reuse hint, since more vision may exist.
        if (!options.provider && !options.providerBin && lastError instanceof Error) {
            const hint = reuseHint(config, options.autoOptions);
            if (hint) {
                lastError.message += hint;
            }
        }
        throw lastError;
    }
    throw new Error(
        `Every configured vision provider failed for this image. ${attempts
            .map((attempt) => `${attempt.provider}: ${attempt.error}`)
            .join(' | ')}${reuseHint(config, options.autoOptions)}`,
    );
}

const INLINE_REGION = new Set(['gemini-api', 'openai', 'anthropic']);

/**
 * Merge granted borrowed routes into the base chain by region: borrowed keys
 * join the inline region after the user's own, borrowed agents slot in before
 * claude-cli (which spends the Claude subscription and stays last). The base
 * order is preserved, so a `config set provider` preference keeps its place.
 */
export function composeChain(
    kind: 'local' | 'remote',
    config: ModlensConfig,
    autoOptions: AutoRouteOptions | undefined,
): VisionProvider[] {
    const chain = [...providerChain(kind, config, autoOptions?.env ?? process.env)];
    const borrowed = reuseProviders(kind, config, autoOptions);
    let preferredName: string | null = null;
    if (config.provider?.trim()) {
        try {
            preferredName = resolveProvider(config.provider.trim()).name;
        } catch {
            preferredName = null;
        }
    }
    if (borrowed.inline.length > 0) {
        const lastInline = chain.map((p) => INLINE_REGION.has(p.name)).lastIndexOf(true);
        // With no inline members in the base chain, reused keys still queue
        // behind a provider the user explicitly preferred to the front, but
        // only for local images: for remote URLs inline-first is a security
        // boundary (only the inline download path runs the SSRF guards), so
        // even a preferred agent stays behind reused keys there.
        const insertAt =
            lastInline >= 0
                ? lastInline + 1
                : kind === 'local' && preferredName === chain[0]?.name
                  ? 1
                  : 0;
        chain.splice(insertAt, 0, ...borrowed.inline);
    }
    if (borrowed.agents.length > 0) {
        // claude-cli keeps its natural last place, but when the user preferred
        // it to the front (or it is the whole chain) nothing cuts ahead of it.
        const last = chain[chain.length - 1];
        const beforeClaude = last?.name === 'claude-cli' && preferredName !== 'claude-cli';
        chain.splice(beforeClaude ? chain.length - 1 : chain.length, 0, ...borrowed.agents);
    }
    return chain;
}

const REUSE_KEY_BY_HARNESS: Record<string, 'codex' | 'opencode' | 'pi' | 'grok'> = {
    codex: 'codex',
    opencode: 'opencode',
    pi: 'pi',
    grok: 'grok',
};

/**
 * When everything failed (or nothing was set up), say so if this machine has
 * borrowable vision the user was never asked about. A hint only: nothing is
 * enabled without an explicit grant.
 */
function reuseHint(config: ModlensConfig, autoOptions: AutoRouteOptions | undefined): string {
    try {
        const grants = config.reuse ?? {};
        const discovery =
            autoOptions?.discovery ??
            discoverAuto({ env: autoOptions?.env, home: autoOptions?.home });
        const unasked: string[] = [];
        const dead: string[] = [];
        for (const probe of discovery.probes) {
            const key = REUSE_KEY_BY_HARNESS[probe.harness];
            if (key === undefined) {
                continue;
            }
            const usable =
                probe.cliFound && probe.visionModels.length > 0 && probe.loggedIn !== false;
            if (grants[key] === undefined && usable) {
                unasked.push(probe.harness);
            } else if (grants[key] === true && !usable) {
                // Granted but currently unusable: signed out, uninstalled, or
                // its vision models went away. Name it instead of pretending
                // the grant never existed.
                dead.push(probe.harness);
            }
        }
        const parts: string[] = [];
        if (unasked.length > 0) {
            parts.push(
                ` Hint: this machine has vision reachable through ${unasked.join(', ')}, which modlens is not yet allowed to reuse. Ask the user, then: modlens config set reuse.<harness> true.`,
            );
        }
        if (dead.length > 0) {
            parts.push(
                ` Note: reuse is granted for ${dead.join(', ')} but it is currently unusable (signed out, uninstalled, or no vision model); check that CLI's login.`,
            );
        }
        return parts.join('');
    } catch {
        return '';
    }
}

/** One provider, one attempt: execute (or spawn), parse, and verify the shape. */
async function runProvider(
    provider: VisionProvider,
    model: string,
    options: AnalyzeOptions,
    resolvedInput: ResolvedInput,
    timeoutMs: number,
    config: ModlensConfig,
    warnings: string[],
): Promise<ProviderParsedOutput> {
    const configured = resolveProviderSettings(provider.name, config);
    // --extra-body replaces the configured object rather than merging into it:
    // a partial override of vendor knobs is hard to reason about at the command
    // line, and the flag is the more specific layer.
    const settings = options.extraBody
        ? { ...configured, extraBody: options.extraBody }
        : configured;
    // The passthrough is a request-body field, so the two CLI agents have
    // nowhere to put it. Saying so beats letting the user believe thinking is
    // off when nothing was sent.
    if (settings.extraBody && !provider.execute) {
        warnings.push(
            `${provider.name} is a CLI provider and takes no request body, so extraBody was ignored for this run.`,
        );
    }
    const providerOptions = {
        imageSource: resolvedInput.source,
        imageKind: resolvedInput.kind,
        model,
        extraPrompt: options.prompt,
        providerBin: options.providerBin,
        workdir: options.workdir,
        timeoutMs,
        settings,
    };

    let parsed: ProviderParsedOutput;
    if (provider.execute) {
        parsed = await provider.execute(providerOptions);
    } else if (provider.buildInvocation && provider.parseOutput) {
        const buildInvocation = provider.buildInvocation;
        const parseOutput = provider.parseOutput;
        // Run the agent in a throwaway directory holding only this one image, so
        // an injection in the image cannot steer it into siblings of the
        // original file. A remote image has no local file to copy, but the agent
        // still must not run in the caller's directory, so it gets an empty
        // throwaway cwd instead. An explicit --workdir opts out.
        const isolation =
            !options.workdir && provider.isolateWorkdir
                ? resolvedInput.kind === 'local'
                    ? isolateImage(resolvedInput.source)
                    : emptyWorkdir()
                : null;
        try {
            const invocation = buildInvocation({
                ...providerOptions,
                imageSource: isolation?.imageSource ?? providerOptions.imageSource,
                workdir: isolation?.workdir ?? providerOptions.workdir,
            });
            // The grace exists for engines with their own internal deadline (agy
            // gets --print-timeout). Engines without one must honour the caller's
            // number as given.
            const backstop = provider.hasInternalTimeout ? timeoutMs + KILL_GRACE_MS : timeoutMs;
            const commandResult = await runCommand(
                provider.name,
                invocation,
                backstop,
                provider.describeFailure,
            );
            parsed = parseOutput(commandResult.stdout);
        } finally {
            // Output goes over stdout, so nothing here needs to outlive the run.
            isolation?.cleanup();
        }
    } else {
        throw new Error(
            `Provider ${provider.name} implements neither execute nor buildInvocation.`,
        );
    }

    // Server-side schema enforcement is uneven across providers, and even the
    // routes that have it can return a shell that only looks right. Verify the
    // shape here so a structurally broken result fails loudly for every
    // provider, and a failover peer gets its turn at a compliant answer.
    // A model with nothing to say for an optional field writes null there,
    // which means the same as leaving it out; dropping it before the check
    // keeps the read alive and keeps null out of what callers receive.
    parsed.result = normalizeVisionResult(parsed.result);
    const missing = missingSchemaFields(parsed.result);
    if (missing.length > 0) {
        throw new Error(
            `${provider.name} returned a result that does not match the vision schema (wrong or missing: ${missing.join(', ')}).`,
        );
    }

    return parsed;
}

export function resolveInput(input: string): ResolvedInput {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('Input path is required.');
    }

    if (isRemoteSource(trimmed)) {
        return { source: trimmed, kind: 'remote' };
    }

    if (/^file:\/\//i.test(trimmed)) {
        return { source: path.resolve(fileURLToPath(trimmed)), kind: 'local' };
    }

    return { source: path.resolve(trimmed), kind: 'local' };
}

function isRemoteSource(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function validateInputFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Input image not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
        throw new Error(`Input is not a file: ${filePath}`);
    }
}

interface IsolatedImage {
    imageSource?: string;
    workdir: string;
    cleanup: () => void;
}

/**
 * Place the input image, and nothing else, into a fresh temp directory the agent
 * runs in. Subprocess providers are handed a path and broad permissions, so text
 * inside the image could otherwise point them at neighbouring files; a directory
 * of one removes that reach.
 */
function isolateImage(source: string): IsolatedImage {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-work-'));
    const imageSource = path.join(workdir, path.basename(source));
    // Always a real copy, never a hardlink: a hardlink shares the inode, so a
    // provider writing to its temp path would mutate the user's original file.
    fs.copyFileSync(source, imageSource);
    fs.chmodSync(imageSource, 0o600);
    return {
        imageSource,
        workdir,
        cleanup: () => fs.rmSync(workdir, { recursive: true, force: true }),
    };
}

/**
 * An empty throwaway cwd for a remote image: there is no local file to copy,
 * but the agent still must not run in the caller's directory, where an
 * injection in the image could read whatever project the user happens to be in.
 */
function emptyWorkdir(): IsolatedImage {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-work-'));
    return {
        workdir,
        cleanup: () => fs.rmSync(workdir, { recursive: true, force: true }),
    };
}

/** Exported for tests: the timeout path is otherwise behind a 30s backstop. */
export function runCommand(
    providerName: string,
    invocation: ProviderInvocation,
    timeoutMs: number,
    describeFailure?: (context: ProviderFailureContext) => string | null,
): Promise<CommandResult> {
    const runStartedAt = Date.now();
    return new Promise((resolve, reject) => {
        // On Windows the bare CLI name resolves to the real file and a .cmd
        // shim is rewritten to a direct `node <entry>` spawn (issue #31);
        // POSIX passes through.
        const plan = resolveSpawnPlan(invocation.command, invocation.args);
        const child = spawn(plan.command, plan.args, {
            cwd: invocation.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Decoders keep state across chunks: a multi-byte character split down the
        // middle used to come out as replacement characters.
        const outDecoder = new TextDecoder('utf-8');
        const errDecoder = new TextDecoder('utf-8');
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        let drainTimer: NodeJS.Timeout | undefined;
        let killTimer: NodeJS.Timeout | undefined;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            // A child that ignores SIGTERM used to keep the caller waiting for
            // as long as it liked, so report the timeout now and make sure it
            // dies.
            settle(null);
            // Deliberately ref'd: an unref'd escalation timer dies with the
            // event loop, and after settle() nothing else keeps a standalone
            // CLI alive, so a SIGTERM-ignoring provider survived its parent.
            // The cost is bounded: the child's own 'exit' clears this, so only
            // the stubborn case holds the process the full grace window.
            killTimer = setTimeout(() => {
                // child.killed only means a signal was delivered, not that the
                // process left, so a child ignoring SIGTERM read as "killed" and
                // never got SIGKILL. Escalate on "has not exited yet" instead.
                if (!exited) {
                    child.kill('SIGKILL');
                }
            }, SIGKILL_GRACE_MS);
        }, timeoutMs);

        // 'close' waits for every stdio pipe to close, but agy leaves a
        // language server running that inherited the pipe, so its write end
        // never closes and 'close' never fires (issue #1). Settle on 'exit'
        // plus a drain window instead, and drop the pipes afterwards so the
        // lingering descendant cannot keep this process alive either.
        const settle = (code: number | null) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            clearTimeout(drainTimer);
            // Flush the decoders: trailing bytes of a split character were dropped.
            stdout += outDecoder.decode();
            stderr += errDecoder.decode();
            child.stdout?.destroy();
            child.stderr?.destroy();
            child.unref();

            if (timedOut) {
                reject(new Error(`${providerName} provider timed out after ${timeoutMs} ms.`));
                return;
            }
            if (code !== 0) {
                // The provider knows what its own error output means; a bare
                // exit code tells the user nothing actionable (issue #3).
                const explained =
                    describeFailure?.({ stdout, stderr, code, startedAt: runStartedAt }) ?? null;
                // Both branches can quote subprocess stderr, and a CLI in a
                // broken auth state loves to print its token there.
                reject(
                    new Error(
                        redactSecrets(
                            explained ??
                                `${providerName} provider failed with code ${code}.${stderr ? ` stderr: ${stderr.trim()}` : ''}`,
                        ),
                    ),
                );
                return;
            }
            resolve({ stdout, stderr });
        };

        let exitCode: number | null = null;
        let exited = false;
        const restartDrain = () => {
            if (!exited || settled) {
                return;
            }
            clearTimeout(drainTimer);
            drainTimer = setTimeout(() => settle(exitCode), DRAIN_GRACE_MS);
        };

        child.stdout.on('data', (chunk: Buffer) => {
            stdout += outDecoder.decode(chunk, { stream: true });
            restartDrain();
        });

        child.stderr.on('data', (chunk: Buffer) => {
            stderr += errDecoder.decode(chunk, { stream: true });
            restartDrain();
        });

        child.on('error', (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            clearTimeout(drainTimer);
            clearTimeout(killTimer);
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                // spawn reports ENOENT for a missing cwd too, and naming the
                // wrong cause sent people installing software they already had.
                const missingCwd = !fs.existsSync(invocation.cwd);
                reject(
                    new Error(
                        missingCwd
                            ? `Working directory does not exist: ${invocation.cwd}`
                            : `Provider CLI not found: ${invocation.command} (spawn ENOENT). Install it and sign in first.`,
                    ),
                );
                return;
            }
            // A spawn-level failure that is not "missing": name the provider
            // and the command, keep the real code (EINVAL, EACCES, ...) — a
            // bare "spawn EINVAL" cost a Windows user a debugging session
            // (issue #31).
            reject(
                new Error(
                    `${providerName} provider could not start \`${invocation.command}\`: ${error.message}`,
                ),
            );
        });

        child.on('exit', (code) => {
            exitCode = code;
            exited = true;
            clearTimeout(killTimer);
            restartDrain();
        });

        // Normal providers close their pipes right after exiting: settle at once.
        child.on('close', (code) => settle(code));
    });
}
