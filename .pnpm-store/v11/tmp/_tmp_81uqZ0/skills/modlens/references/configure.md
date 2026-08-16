# Configuring ModLens

English | [中文](configure.zh-CN.md)

Read this when the user asks how to set up, configure, or switch ModLens providers. Prefer running the commands for the user over explaining them.

## Where config lives

`~/.modlens/config.json`, managed by the CLI. Precedence: CLI flags > environment variables > config file > built-in defaults. With no `provider` set, runs walk the failover chain in order (an available `gemini-api` key is tried before the agent CLIs); a machine with nothing configured at all ends up on `antigravity-cli`.

```bash
modlens config init                     # write a starter config (refuses to overwrite; --force to redo)
modlens config show                     # effective file, API keys masked
modlens config set provider <name>      # change the default provider
modlens config set <provider>.<field> <value>   # fields: apiKey, baseUrl, model, proxy, extraBody, structuredOutput
```

`config set` writes the file with 0600 permissions.

## The file's exact shape

Everything lives under five top-level keys, all optional. This example shows every supported key and field at once (a real file only needs what you use). A missing file means all defaults. Provider settings sit under `providers.<name>`, not at the top level, which is the mistake hand-editors make most.

```json
{
  "provider": "gemini-api",
  "proxy": "http://127.0.0.1:7890",
  "reuse": { "claude": true, "codex": true, "opencode": false, "pi": true, "grok": true },
  "guards": {
    "allowModels": ["deepseek-v4-*", "glm-5.*", "minimax-m2.5*", "qwen3-coder*"],
    "denyModels": ["glm-*v*", "deepseek-vl*"],
    "denyWhenUnknown": false
  },
  "providers": {
    "antigravity-cli": { "model": "gemini-3.6-flash-low" },
    "gemini-api": {
      "apiKey": "AIza...",
      "baseUrl": "https://generativelanguage.googleapis.com",
      "model": "gemini-3.6-flash"
    },
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "model": "qwen3.6-27b",
      "proxy": "http://127.0.0.1:7890",
      "extraBody": { "thinking": { "type": "disabled" } },
      "structuredOutput": true
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-haiku-4-5-20251001"
    },
    "claude-cli": { "model": "haiku" }
  }
}
```

Field semantics:

- `provider`: which provider runs when `-p` is not given. Canonical names or aliases both work (`agy`/`antigravity` for `antigravity-cli`, `gemini` for `gemini-api`, `openai-compat` for `openai`, `claude` for `anthropic`, `claude-code` for `claude-cli`). Empty or absent pins nothing: the failover chain decides, trying configured API providers before the agent CLIs.
- `providers.<name>.<field>`: six fields exist, `apiKey`, `baseUrl`, `model`, `proxy`, `extraBody`, and `structuredOutput` (the openai route only). Every provider entry is optional, and every field inside it is optional. Alias keys are read too (settings saved under `gemini` are found when `gemini-api` resolves), with the canonical key winning on conflict.
- `providers.<name>.extraBody`: a JSON object merged into the request body of the API providers (`gemini-api`, `openai`, `anthropic`), for whatever knobs that vendor has and modlens has no flag for. Turning thinking off is the usual reason, see the section below. Nested objects merge key by key, so adding one knob leaves the rest of that block alone. The fields carrying the image, the prompt, and each route's own enforcement machinery are refused with an error naming the field. `response_format` on the `openai` route is not one of them: setting it there deliberately replaces the schema modlens would otherwise send. The two CLI providers take no request body, so a run on `antigravity-cli` or `claude-cli` ignores it and says so in `meta.warnings`.
- `providers.openai.structuredOutput`: `true` asks an OpenAI-compatible gateway to enforce the vision contract itself, as `response_format: json_schema` in the strict form those endpoints require. Off by default, since a gateway without structured-output support answers 400 for the field. A `response_format` you set in `extraBody` wins over it.
- `guards`: the invocation guard, for people who run both text-only and vision-capable models through the same client. Both lists hold glob patterns (`*` and `?`, case-insensitive, matched against the model name and `provider/model`), set with `modlens config set guards.denyModels '["gemini-3*"]'` or `guards.allowModels` (a JSON array or a comma-separated list, empty clears). Two ways to express the same intent, pick the shorter list:
  - `denyModels` alone: everything runs the engine except the listed vision models. Right when text-only models are the majority of what you plug in.
  - `allowModels` non-empty (allowlist mode): only the listed models run the engine, every other identified model is denied. Right for the actual 2026 landscape, where text-only models are the short list. A deny pattern still wins over an allow match, so a broad allow can have its vision variants carved out, as in the example above: `glm-5.*` allows the text line while `glm-*v*` catches `glm-5v-turbo`. Anchor allow patterns tightly (`deepseek-v4-*`, not `deepseek*`) so a vendor's next multimodal generation falls off the list and steps aside until you have checked it.
  - List a model by what actually reaches it, not by what it could see: a multimodal model behind a gateway that strips images still needs modlens, and your session transcript records the model name the gateway reports. `modlens doctor`'s Guard section shows the rules and a live verdict for checking the result.
  - `denyWhenUnknown` (default `false`) decides what happens when no signal identifies the active model, in either mode: `false` proceeds, `true` denies. The active model is detected from, strongest first: the `MODLENS_MODEL` env var (`none` means "treat as unknown"), the harness's session storage, the `--model` self-report.
- Environment variables override the file for these bindings: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`. Beyond those, modlens reads `MODLENS_HARNESS` (paste-recovery and guard scope), `MODLENS_MODEL` (guard override, see `guards`), and the fingerprints harnesses inject themselves, which pin the guard's storage lookup to the current session: `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, plus the presence markers harness detection relies on (`CLAUDECODE`, `PI_CODING_AGENT`, `CODEX_SANDBOX`).
- `reuse.<claude|codex|opencode|pi|grok>`: per-harness grants for spending other local logins, written by the onboarding conversation (`references/onboard.md`). `true` lets reads reuse that harness (pi credentials join the inline region with every guard intact; a signed-in Codex, an OpenCode vision model, or pi driven directly join the agent region before `claude-cli`), `false` records a refusal so the user is never re-asked, absent means never asked and nothing runs. `claude` absent counts as granted: `claude-cli` predates this model as a built-in provider, and `reuse.claude false` removes it from the chain (`-p claude-cli` still pins). Reused engines get no priority over the user's own: regions order by speed class only. Every reused answer adds a `meta.warnings` line naming whose quota it spent, and `modlens doctor`'s Reuse section shows each harness's decision plus what discovery found (probe results cache for 6 hours in `~/.modlens/auto-cache.json`; doctor always re-probes). Set with `modlens config set reuse.codex true` (empty clears back to never-asked).
- Unknown top-level keys and unknown provider names are ignored rather than rejected, so a typo fails quiet: run `modlens doctor` after hand-editing, it shows which file and env values are actually in effect.

Hand-editing is fine (keep the file valid JSON and its permissions 0600). `modlens config set` does the same thing with guardrails.

## Provider setup recipes

### antigravity-cli (default, free, no key)

Needs Antigravity CLI installed and signed in:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy    # user must complete browser sign-in themselves, then exit
```

Any free Google account works; no Google AI Pro needed. Sign-in cannot be automated, ask the user to run `agy` once.

### gemini-api (free key, fastest free route, 5-10s)

1. The user creates a key at https://aistudio.google.com (three minutes, no credit card, free tier does not expire).
2. Store it either way:

```bash
modlens config set gemini-api.apiKey <key>
# value omitted: a hidden prompt, so the key skips argv, shell history, and this chat
modlens config set gemini-api.apiKey
# or environment: export GEMINI_API_KEY=<key>
```

Offer the hidden prompt first when the user is at their own terminal. Most users paste the key into the chat because it is convenient, and that works too: take it and store it. The prompt is for the ones who would rather not.

Default model `gemini-3.6-flash` has vision on the free tier (about 10-15 requests/min, 1500/day). Free-tier data may be used by Google to improve products; mention this if the user handles sensitive images.

### openai (any OpenAI-compatible multimodal endpoint)

Needs three values. Example for DashScope qwen:

```bash
modlens config set openai.baseUrl https://dashscope.aliyuncs.com/compatible-mode/v1
modlens config set openai.apiKey <sk-key>
modlens config set openai.model qwen3.6-27b
```

For official OpenAI: baseUrl `https://api.openai.com/v1`, a vision-capable model. Environment equivalents: `OPENAI_BASE_URL`, `OPENAI_API_KEY`. The model must be multimodal; text-only models will fail or hallucinate.

This route enforces nothing server-side by default, so a weaker model can answer with half the contract and the run fails with an explicit error. If that happens, ask the gateway to enforce it:

```bash
modlens config set openai.structuredOutput true
```

The contract goes out as `response_format: json_schema` in strict form, derived from the schema modlens checks against. Off by default because a gateway without structured-output support answers 400 for the field, so turn it back off if the endpoint refuses it. Turning thinking off (below) makes the shape failures more likely, so the two often go together.

### anthropic (Claude API key)

```bash
modlens config set anthropic.apiKey <sk-ant-key>
# or: export ANTHROPIC_API_KEY=<key>
```

Default model is Claude Haiku (`claude-haiku-4-5-20251001`). Schema is enforced through a forced tool call.

**`ANTHROPIC_BASE_URL` trap.** modlens binds `ANTHROPIC_BASE_URL` to `anthropic.baseUrl`, so it inherits whatever that variable points at. If the user set it in their shell to route Claude Code through a text-only gateway (a common way to run a non-Claude model behind the Claude Code UI), then `-p anthropic` silently sends the vision request to that gateway too, where it fails or comes back blind, with no hint that the endpoint was swapped. Check `echo $ANTHROPIC_BASE_URL` when anthropic vision misbehaves. Fixes: unset it for the modlens call, pin the real endpoint with `modlens config set anthropic.baseUrl https://api.anthropic.com`, or use `-p gemini-api` instead.

### claude-cli (Claude Code login, no key)

Rides an existing `claude` sign-in, so it costs the user's Claude subscription quota, not a separate API bill. Requires Claude Code installed and logged in (`claude --version` to check). Runs with `--allowedTools Read` only. Local image files only; for remote URLs use gemini-api instead. Default model alias `haiku`.

```bash
modlens config set provider claude-cli   # make it the default if the user wants
```

## Turning thinking off

A reasoning model spends its thinking budget before it answers. Reading text out of an image needs none of that, so on a model that thinks by default the run is slower and more expensive for nothing. Every vendor names the switch differently, and there is no portable one, so modlens sends whatever you put in `extraBody` and leaves the naming to the vendor's own docs.

```bash
modlens config set openai.extraBody '{"thinking":{"type":"disabled"}}'   # persist it
modlens -i shot.png --extra-body '{"thinking":{"type":"disabled"}}'      # one run only
modlens config set openai.extraBody ''                                   # clear it
```

`--extra-body` replaces the stored object for that run rather than merging into it.

Known spellings, current as of August 2026:

| Endpoint | Field to send |
| :-- | :-- |
| MiMo official API (`api.xiaomimimo.com/v1`) | `{"thinking":{"type":"disabled"}}` |
| MiMo Responses-format route | `{"reasoning":{"effort":"none"}}` |
| Qwen, GLM, MiMo and friends self-hosted on vLLM or SGLang | `{"chat_template_kwargs":{"enable_thinking":false}}` |
| OpenAI-style gateways that accept an effort level | `{"reasoning_effort":"low"}` |
| `gemini-api`, Gemini 3 family | `{"generationConfig":{"thinkingConfig":{"thinkingLevel":"LOW"}}}` |
| `gemini-api`, Gemini 2.5 Flash and Flash Lite | `{"generationConfig":{"thinkingConfig":{"thinkingBudget":0}}}` |
| `anthropic` | nothing to do, thinking is off unless it is asked for |

Three things that bite:

- Not every model can turn it off. Gemini 3 Pro and Gemini 2.5 Pro have no off switch, only a lower level. Some models ignore an effort field entirely and think anyway.
- Strict clouds (Groq and Cerebras among them) reject fields they do not recognize with a 400. If a request that worked before now fails with a 400 naming your field, that gateway wants a different spelling, not this one.
- Others accept an unknown field and quietly ignore it, so check that it took effect instead of assuming. Compare `meta.durationSeconds` and the token counts in `meta.usage` against a run without `extraBody`. If neither moved, the field did not land.
- A weaker model may need its thinking to fill the schema. Measured on one flowchart: `gemini-3.6-flash` at `thinkingLevel: LOW` came back in 5.7s instead of 12s with the same regions and the same transcription, but `qwen3.6-27b` on DashScope with `enable_thinking: false` started omitting the required `type` on layout regions, which modlens rejects rather than passing off as evidence. If shape errors appear right after you turn thinking off, that is the trade, so turn it back on for that model or move to a route with server-side schema enforcement.

## Choosing a provider for the user

- Wants zero setup and free: `antigravity-cli` (needs agy sign-in, 15-40s per image; for dense or hard images try `-m gemini-3.1-pro-high`).
- Wants fast and free: `gemini-api` (three-minute key, 5-10s).
- Already pays for Claude: `claude-cli` (no extra key, 20-45s agent loop) or `anthropic` (API billing).
- Has a favorite multimodal endpoint (qwen, GLM, ...): `openai`.

Every configured provider also backs up the others: a run tries them in a
fixed order (inline API providers first at 5-10s, then the agents; for remote
URLs the order is also a security boundary) and fails over on an error, a
timeout, or a schema-violating result.
`config set provider <name>` moves a provider to the front of its allowed
region; `-p <name>` pins exactly one with no fallback. `doctor` prints the
chains, and the result's `meta.attempts` shows what a run actually tried.

## Troubleshooting

- Error names a missing env var or `config set` command: run exactly that.
- `Provider CLI not found: agy`: install Antigravity CLI or switch provider.
- `Claude CLI reported ...` or empty result: check `claude` login state.
- openai route `does not match the vision schema`: retry once, then switch to gemini-api or anthropic.
- `extraBody cannot override "<field>"`: that field carries the image, the prompt, or the schema. Drop it from the object and keep the vendor knobs.
- A 400 that names a field you set in `extraBody`: that gateway does not know it. See the thinking section above for the other spellings.
- `config init` refusing to run: the file exists; use `modlens config show` first, `--force` only if the user agrees to overwrite.
