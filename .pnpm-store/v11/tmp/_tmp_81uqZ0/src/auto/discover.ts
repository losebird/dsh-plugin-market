// Auto-mode discovery (spec: .issues/2026-08-13-auto-mode): find local harness
// CLIs whose logins and model catalogs could lend this machine vision, without
// spending anything. Pure read-only probing: PATH lookups, harness metadata
// files, and one `opencode models` listing (its catalog lives behind the CLI).
// The chain does not consume these results yet; doctor shows them so the
// discovery is visible and debuggable before any routing lands on top.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { globMatch } from '../guard/rules.ts';
import { findOnPath } from '../providers/availability.ts';
import { redactSecrets } from '../util/redact.ts';
import { resolveSpawnPlan } from '../util/winExec.ts';

/**
 * Mainstream vision-capable model names, as glob patterns against the bare
 * model id (a provider/ prefix is stripped before matching). Deliberately
 * hardcoded: the field moves fast but a release cadence keeps up, and harness
 * metadata (codex input_modalities, pi input) outranks this table wherever it
 * exists. Snapshot: 2026-08.
 */
const VISION_MODEL_PATTERNS = [
    'claude-*',
    'gpt-4o*',
    'gpt-4.1*',
    'gpt-5*',
    'o3*',
    'o4*',
    'gemini-*',
    'glm-*v*',
    'qwen*-vl*',
    'qwen3.5-plus*',
    'qwen3.6-plus*',
    'kimi-k2.5*',
    'kimi-k2.6*',
    'kimi-k2.7*',
    'kimi-k3*',
    'moonshot-v1-*vision*',
    'minimax-vl*',
    'minimax-m3*',
    'deepseek-vl*',
    'deepseek-ocr*',
    'janus*',
    'pixtral*',
    'llama-4*',
    'llama-3.2-*vision*',
    'grok-4*',
    'grok-2-vision*',
    'internvl*',
];

export function isVisionModel(modelId: string): boolean {
    const bare = modelId.includes('/') ? modelId.slice(modelId.lastIndexOf('/') + 1) : modelId;
    return VISION_MODEL_PATTERNS.some((pattern) => globMatch(pattern, bare));
}

export type AutoHarness = 'claude-code' | 'codex' | 'opencode' | 'pi' | 'grok';

export interface HarnessProbe {
    harness: AutoHarness;
    cliFound: boolean;
    cliPath?: string;
    /** Credential evidence found locally. Undefined when the probe cannot tell. */
    loggedIn?: boolean;
    /** Model ids judged vision-capable and plausibly borrowable. */
    visionModels: string[];
    /** How capability was judged: harness metadata beats the builtin table. */
    source: 'metadata' | 'builtin-table' | 'none';
    elapsedMs: number;
    error?: string;
}

export interface AutoDiscovery {
    probes: HarnessProbe[];
    cachedAt: string;
    fromCache: boolean;
}

export interface DiscoverOptions {
    env?: NodeJS.ProcessEnv;
    home?: string;
    /** Cache location, default <home>/.modlens/auto-cache.json. */
    cachePath?: string;
    /** Bypass and rewrite the cache. */
    fresh?: boolean;
    /** Cache lifetime, default 6 hours. */
    ttlMs?: number;
    /** Injectable CLI runner for tests; only `opencode models` uses it. */
    runCli?: (bin: string, args: string[], timeoutMs: number) => string;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const CLI_TIMEOUT_MS = 10_000;

function defaultRunCli(bin: string, args: string[], timeoutMs: number): string {
    // The same Windows shim rewriting the provider spawn uses (issue #31): a
    // .cmd cannot be exec'd without a shell, and the probes talk to the same
    // npm-installed CLIs.
    const plan = resolveSpawnPlan(bin, args);
    return execFileSync(plan.command, plan.args, {
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: 'pipe',
    });
}

function timed<T extends Omit<HarnessProbe, 'elapsedMs'>>(run: () => T): HarnessProbe {
    const start = Date.now();
    const probe = run();
    return { ...probe, elapsedMs: Date.now() - start };
}

function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function probeClaude(env: NodeJS.ProcessEnv): HarnessProbe {
    return timed(() => {
        const cliPath = findOnPath('claude', env);
        if (!cliPath) {
            return {
                harness: 'claude-code' as const,
                cliFound: false,
                visionModels: [],
                source: 'none' as const,
            };
        }
        // Anthropic's whole current lineup is multimodal, and the model set is
        // server-side, so there is no local catalog to enumerate. claude-cli
        // (already a provider) is the borrowable route.
        return {
            harness: 'claude-code' as const,
            cliFound: true,
            cliPath,
            visionModels: ['anthropic/* (all current models)'],
            source: 'builtin-table' as const,
        };
    });
}

function probeCodex(env: NodeJS.ProcessEnv, home: string): HarnessProbe {
    return timed(() => {
        const cliPath = findOnPath('codex', env);
        const base = { harness: 'codex' as const, cliFound: cliPath !== null };
        if (!cliPath) {
            return { ...base, visionModels: [], source: 'none' as const };
        }
        const codexHome = path.join(home, '.codex');
        const loggedIn = fs.existsSync(path.join(codexHome, 'auth.json'));
        // config.toml is optional; a stock install without one routes to the
        // official lineup, whose default model reads images.
        if (!fs.existsSync(path.join(codexHome, 'config.toml'))) {
            return {
                ...base,
                cliPath,
                loggedIn,
                visionModels: ['default'],
                source: 'builtin-table' as const,
            };
        }
        try {
            // Two known keys out of a TOML file: strict line-anchored reads, no
            // TOML dependency for this.
            const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf-8');
            const catalogPath = toml.match(/^model_catalog_json\s*=\s*"([^"]+)"/m)?.[1];
            const thirdParty = /^model_provider\s*=/m.test(toml);
            if (!catalogPath) {
                // A stock install routes to OpenAI's own lineup, whose default
                // model reads images; only a third-party model_provider with no
                // catalog leaves capability unknowable.
                return thirdParty
                    ? { ...base, cliPath, loggedIn, visionModels: [], source: 'none' as const }
                    : {
                          ...base,
                          cliPath,
                          loggedIn,
                          visionModels: ['default'],
                          source: 'builtin-table' as const,
                      };
            }
            const catalog = readJson(catalogPath) as {
                models?: Array<{ slug?: string; input_modalities?: string[] }>;
            };
            const vision = (catalog.models ?? [])
                .filter((m) => m.slug && (m.input_modalities ?? []).includes('image'))
                .map((m) => m.slug as string);
            return {
                ...base,
                cliPath,
                loggedIn,
                visionModels: vision,
                source: 'metadata' as const,
            };
        } catch (error) {
            return {
                ...base,
                cliPath,
                loggedIn,
                visionModels: [],
                source: 'none' as const,
                error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(
                    0,
                    200,
                ),
            };
        }
    });
}

function probeGrok(env: NodeJS.ProcessEnv, home: string): HarnessProbe {
    return timed(() => {
        const cliPath = findOnPath('grok', env);
        const base = { harness: 'grok' as const, cliFound: cliPath !== null };
        if (!cliPath) {
            return { ...base, visionModels: [], source: 'none' as const };
        }
        const grokHome = path.join(home, '.grok');
        let loggedIn = false;
        try {
            const auth = readJson(path.join(grokHome, 'auth.json')) as Record<string, unknown>;
            loggedIn = Object.keys(auth).length > 0;
        } catch {
            // no auth evidence; stays false
        }
        // models_cache.json lists the reachable model ids but carries no
        // modality fields, so the builtin table judges them. A missing cache
        // still means the official lineup, whose default model reads images.
        try {
            const cache = readJson(path.join(grokHome, 'models_cache.json')) as {
                models?: Record<string, unknown>;
            };
            const vision = Object.keys(cache.models ?? {}).filter((id) => isVisionModel(id));
            return {
                ...base,
                cliPath,
                loggedIn,
                visionModels: vision.length > 0 ? vision : ['default'],
                source: 'builtin-table' as const,
            };
        } catch {
            return {
                ...base,
                cliPath,
                loggedIn,
                visionModels: ['default'],
                source: 'builtin-table' as const,
            };
        }
    });
}

function probePi(env: NodeJS.ProcessEnv, home: string): HarnessProbe {
    return timed(() => {
        const cliPath = findOnPath('pi', env);
        const base = { harness: 'pi' as const, cliFound: cliPath !== null };
        if (!cliPath) {
            return { ...base, visionModels: [], source: 'none' as const };
        }
        const agentDir = path.join(home, '.pi', 'agent');
        try {
            const auth = readJson(path.join(agentDir, 'auth.json')) as Record<string, unknown>;
            const providersWithCreds = new Set(Object.keys(auth));
            const store = readJson(path.join(agentDir, 'models-store.json')) as Record<
                string,
                { models?: Array<{ id?: string; provider?: string; input?: string[] }> }
            >;
            const vision: string[] = [];
            for (const entry of Object.values(store)) {
                for (const model of entry?.models ?? []) {
                    if (
                        model.id &&
                        (model.input ?? []).includes('image') &&
                        model.provider &&
                        providersWithCreds.has(model.provider)
                    ) {
                        vision.push(model.id);
                    }
                }
            }
            return {
                ...base,
                cliPath,
                loggedIn: providersWithCreds.size > 0,
                visionModels: vision,
                source: 'metadata' as const,
            };
        } catch (error) {
            return {
                ...base,
                cliPath,
                visionModels: [],
                source: 'none' as const,
                error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(
                    0,
                    200,
                ),
            };
        }
    });
}

function probeOpencode(
    env: NodeJS.ProcessEnv,
    runCli: NonNullable<DiscoverOptions['runCli']>,
): HarnessProbe {
    return timed(() => {
        const cliPath = findOnPath('opencode', env);
        const base = { harness: 'opencode' as const, cliFound: cliPath !== null };
        if (!cliPath) {
            return { ...base, visionModels: [], source: 'none' as const };
        }
        try {
            // The catalog lives behind the CLI (`opencode models` prints
            // provider/model ids), and the listing carries no modality data,
            // so the builtin table judges the ids.
            const listing = runCli(cliPath, ['models'], CLI_TIMEOUT_MS);
            const vision = listing
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && isVisionModel(line));
            return { ...base, cliPath, visionModels: vision, source: 'builtin-table' as const };
        } catch (error) {
            return {
                ...base,
                cliPath,
                visionModels: [],
                source: 'none' as const,
                error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(
                    0,
                    200,
                ),
            };
        }
    });
}

interface CacheFile {
    cachedAt: string;
    probes: HarnessProbe[];
}

function readCache(cachePath: string, ttlMs: number): CacheFile | null {
    try {
        const cached = readJson(cachePath) as CacheFile;
        if (!cached.cachedAt || !Array.isArray(cached.probes)) {
            return null;
        }
        const cachedAtMs = Date.parse(cached.cachedAt);
        // NaN comparisons are always false, so an invalid timestamp would
        // otherwise never expire.
        if (!Number.isFinite(cachedAtMs) || Date.now() - cachedAtMs > ttlMs) {
            return null;
        }
        return cached;
    } catch {
        return null;
    }
}

export function discoverAuto(options: DiscoverOptions = {}): AutoDiscovery {
    const env = options.env ?? process.env;
    const home = options.home ?? os.homedir();
    const cachePath = options.cachePath ?? path.join(home, '.modlens', 'auto-cache.json');
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

    if (!options.fresh) {
        const cached = readCache(cachePath, ttlMs);
        if (cached) {
            return { probes: cached.probes, cachedAt: cached.cachedAt, fromCache: true };
        }
    }

    const runCli = options.runCli ?? defaultRunCli;
    const probes = [
        probeClaude(env),
        probeCodex(env, home),
        probeOpencode(env, runCli),
        probePi(env, home),
        probeGrok(env, home),
    ];
    const cachedAt = new Date().toISOString();
    try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ cachedAt, probes }, null, 2), {
            mode: 0o600,
        });
    } catch {
        // A read-only home must not break discovery; the cache is an optimization.
    }
    return { probes, cachedAt, fromCache: false };
}
