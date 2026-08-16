// The CLI assembly (arg parsing, validation branches, exit codes) only exists in
// the built bundle, since main.ts parses argv on import. These tests build once,
// then drive the real binary as a subprocess and assert on exit code and stderr.
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist', 'main.js');

// The bound env vars leak into `config show`; strip them for a clean baseline.
const BOUND_ENV = [
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
];

function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of BOUND_ENV) {
        delete env[key];
    }
    return { ...env, ...overrides };
}

function run(args: string[], env: Record<string, string> = {}) {
    // process.execPath, not 'node': tests that empty PATH to starve the
    // provider chain must still be able to launch the CLI itself.
    const res = spawnSync(process.execPath, [cli, ...args], {
        encoding: 'utf-8',
        env: baseEnv(env),
    });
    return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeAll(() => {
    // Always rebuild so the assembly under test is the current source, not a
    // stale dist left over from a previous run. shell:true so Windows resolves
    // `pnpm` to `pnpm.cmd` through PATHEXT; execFile alone would only try pnpm.exe.
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'ignore', shell: true });
}, 120_000);

describe('analyze argument validation', () => {
    it('exits non-zero when the required --input is missing', () => {
        const { code, stderr } = run(['analyze']);
        expect(code).toBe(1);
        expect(stderr).toMatch(/--input/);
    });

    it('rejects a non-numeric --timeout before doing any work', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cli-'));
        const file = path.join(dir, 'x.png');
        fs.writeFileSync(file, Buffer.from('bytes'));
        const { code, stderr } = run(['-i', file, '--timeout', 'abc']);
        expect(code).toBe(1);
        expect(stderr).toMatch(/Invalid --timeout/);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('rejects an unsupported provider', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cli-'));
        const file = path.join(dir, 'x.png');
        fs.writeFileSync(file, Buffer.from('bytes'));
        const { code, stderr } = run(['-i', file, '-p', 'bogus-provider']);
        expect(code).toBe(1);
        expect(stderr).toMatch(/Unsupported provider/);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('recover-paste argument validation', () => {
    it('rejects trailing garbage in numeric flags (the parseInt footgun)', () => {
        // parseInt("3x") returns 3; the strict parser must refuse it instead.
        const count = run(['recover-paste', '--count', '3x']);
        expect(count.code).toBe(1);
        expect(count.stderr).toMatch(/Invalid --count/);
        const timeout = run(['-i', 'nope.png', '--timeout', '10oops']);
        expect(timeout.code).toBe(1);
        expect(timeout.stderr).toMatch(/Invalid --timeout/);
    });

    it('rejects a non-positive --count', () => {
        const { code, stderr } = run(['recover-paste', '--count', '0']);
        expect(code).toBe(1);
        expect(stderr).toMatch(/Invalid --count/);
    });
});

describe('top-level wiring', () => {
    it('prints the version and exits 0', () => {
        const { code, stdout } = run(['--version']);
        expect(code).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('starts without loading node:sqlite (no experimental warning on stderr)', () => {
        // Bundling undici used to hoist its lazy require('node:sqlite') into a
        // top-level import, so every CLI start printed an ExperimentalWarning.
        const { stderr } = run(['--version']);
        expect(stderr).not.toContain('ExperimentalWarning');
    });

    it('parses argv with node semantics when an Electron runtime is present (#25)', () => {
        // In a packaged Electron host, process.versions.electron makes a
        // bare parseAsync() slice argv as an app: the script path lands as a
        // stray positional. That bare form is the #25 regression this pins.
        // Commander 13.1 already applies node slicing to any explicitly
        // passed argv, so { from: 'node' } in main.ts is explicit protection
        // on top, not the only working spelling. The shim recreates the
        // Electron runtime shape around the real built CLI.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-electron-'));
        const shim = path.join(dir, 'electron-shim.cjs');
        fs.writeFileSync(
            shim,
            "Object.defineProperty(process.versions, 'electron', { value: '30.0.0', configurable: true });\n",
        );
        // `config show` is the discriminating command: --version and --help
        // exit before commander reports stray positionals, so they stay green
        // even on the broken argv slicing. Mis-sliced argv sends `config
        // show` into the default analyze command, which then exits 1 over the
        // missing --input.
        const show = spawnSync(process.execPath, ['--require', shim, cli, 'config', 'show'], {
            encoding: 'utf-8',
            env: baseEnv(),
        });
        expect(show.status).toBe(0);
        expect(show.stderr).not.toMatch(/--input/);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('guard', () => {
    function homeWithGuards(guards: object): string {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        fs.mkdirSync(path.join(home, '.modlens'));
        fs.writeFileSync(path.join(home, '.modlens', 'config.json'), JSON.stringify({ guards }));
        return home;
    }

    it('denies a deny-listed model with exit 1 and a machine-readable verdict', () => {
        const home = homeWithGuards({ denyModels: ['gpt-5.6*'] });
        const { code, stdout } = run(['guard'], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: 'gpt-5.6-sol',
        });
        expect(code).toBe(1);
        const verdict = JSON.parse(stdout) as Record<string, string>;
        expect(verdict.guard).toBe('deny');
        expect(verdict.matched).toBe('gpt-5.6*');
        expect(verdict.source).toBe('env');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('allows a model off the list with exit 0', () => {
        const home = homeWithGuards({ denyModels: ['gpt-5.6*'] });
        const { code, stdout } = run(['guard'], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: 'deepseek-v4-flash',
        });
        expect(code).toBe(0);
        expect((JSON.parse(stdout) as Record<string, string>).guard).toBe('allow');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('falls back to the --model self-report when nothing else identifies the model', () => {
        const home = homeWithGuards({ denyModels: ['gemini-3*'] });
        const { code, stdout } = run(['guard', '--model', 'gemini-3.1-pro-high'], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
        });
        expect(code).toBe(1);
        expect((JSON.parse(stdout) as Record<string, string>).source).toBe('self-report');
        fs.rmSync(home, { recursive: true, force: true });
    });
});

describe('analyze guard gate', () => {
    function guardedHome(guards: object): { home: string; file: string } {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        fs.mkdirSync(path.join(home, '.modlens'));
        fs.writeFileSync(path.join(home, '.modlens', 'config.json'), JSON.stringify({ guards }));
        const file = path.join(home, 'x.png');
        fs.writeFileSync(file, Buffer.from('bytes'));
        return { home, file };
    }

    it('does not gate on a whitespace-only MODLENS_MODEL (no sniffing inside analyze)', () => {
        const { home, file } = guardedHome({ denyModels: ['gpt-5.6*'] });
        // PATH is emptied so the provider chain fails fast without quota.
        const { stderr } = run(['-i', file], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: '   ',
            PATH: '',
        });
        expect(stderr).not.toMatch(/guard/i);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('lets MODLENS_MODEL=none pass even under denyWhenUnknown (advisory only)', () => {
        const { home, file } = guardedHome({ denyModels: ['gpt-5.6*'], denyWhenUnknown: true });
        const { stderr } = run(['-i', file], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: 'none',
            PATH: '',
        });
        expect(stderr).not.toMatch(/guard/i);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('refuses to spend a provider call when MODLENS_MODEL is deny-listed', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        fs.mkdirSync(path.join(home, '.modlens'));
        fs.writeFileSync(
            path.join(home, '.modlens', 'config.json'),
            JSON.stringify({ guards: { denyModels: ['gpt-5.6*'] } }),
        );
        const file = path.join(home, 'x.png');
        fs.writeFileSync(file, Buffer.from('bytes'));
        const { code, stderr } = run(['-i', file], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: 'gpt-5.6-sol',
        });
        expect(code).toBe(1);
        expect(stderr).toMatch(/guard/i);
        expect(stderr).toContain('gpt-5.6*');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('refuses to spend a provider call when MODLENS_MODEL is off the allowlist', () => {
        const { home, file } = guardedHome({ allowModels: ['deepseek-v4-*'] });
        const { code, stderr } = run(['-i', file], {
            HOME: home,
            USERPROFILE: home,
            MODLENS_HARNESS: 'none',
            MODLENS_MODEL: 'claude-fable-5',
        });
        expect(code).toBe(1);
        expect(stderr).toMatch(/guard/i);
        expect(stderr).toContain('allowModels');
        fs.rmSync(home, { recursive: true, force: true });
    });
});

describe('config show', () => {
    it('prints an empty effective config for a fresh home', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        // HOME for POSIX, USERPROFILE for Windows: os.homedir() reads one or the
        // other, and the config dir hangs off it.
        const { code, stdout } = run(['config', 'show'], { HOME: home, USERPROFILE: home });
        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual({ providers: {} });
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('merges a bound env var into the effective config, masked and tagged', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        const { code, stdout } = run(['config', 'show'], {
            HOME: home,
            USERPROFILE: home,
            GEMINI_API_KEY: 'AIzaSecretFromEnv12345',
        });
        expect(code).toBe(0);
        const parsed = JSON.parse(stdout) as {
            providers: Record<string, Record<string, string>>;
        };
        expect(parsed.providers['gemini-api'].apiKey).toMatch(/\(env\)$/);
        expect(parsed.providers['gemini-api'].apiKey).not.toContain('SecretFromEnv');
        fs.rmSync(home, { recursive: true, force: true });
    });
});

describe.skipIf(process.platform === 'win32')(
    'proxy integration against the built CLI (#23)',
    () => {
        it('reaches an API provider through an HTTP proxy with the real dispatcher', async () => {
            const http = await import('http');
            // A fake Gemini endpoint answering a schema-complete vision result.
            const visionResult = {
                summary: 'PROXIED-OK',
                ocr: { full_text: 'PROXIED-OK', lines: [] },
                layout: { regions: [] },
                semantics: { scene: 's', entities: [], relations: [] },
                visual: { dominant_colors: [], style: 's', notes: [] },
                uncertainty: [],
            };
            const gemini = http.createServer((_req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(
                    JSON.stringify({
                        candidates: [
                            { content: { parts: [{ text: JSON.stringify(visionResult) }] } },
                        ],
                    }),
                );
            });
            await new Promise<void>((r) => gemini.listen(0, '127.0.0.1', r));
            const geminiPort = (gemini.address() as { port: number }).port;

            // A minimal proxy speaking both forms undici's ProxyAgent uses:
            // absolute-URL forwarding for http targets, CONNECT for https.
            const net = await import('net');
            let proxied = 0;
            const proxy = http.createServer((req, res) => {
                proxied += 1;
                const target = new URL(req.url as string);
                const upstream = http.request(
                    {
                        host: target.hostname,
                        port: target.port,
                        path: target.pathname + target.search,
                        method: req.method,
                        headers: req.headers,
                    },
                    (upstreamRes) => {
                        res.writeHead(upstreamRes.statusCode as number, upstreamRes.headers);
                        upstreamRes.pipe(res);
                    },
                );
                req.pipe(upstream);
            });
            proxy.on('connect', (req, clientSocket, head) => {
                proxied += 1;
                const [host, port] = (req.url as string).split(':');
                const upstream = net.connect(Number(port), host, () => {
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    upstream.write(head);
                    upstream.pipe(clientSocket);
                    clientSocket.pipe(upstream);
                });
                upstream.on('error', () => clientSocket.destroy());
                clientSocket.on('error', () => upstream.destroy());
            });
            await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
            const proxyPort = (proxy.address() as { port: number }).port;

            // A private HOME so the real ~/.modlens/config.json stays untouched.
            const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-proxy-'));
            fs.mkdirSync(path.join(home, '.modlens'));
            fs.writeFileSync(
                path.join(home, '.modlens', 'config.json'),
                JSON.stringify({
                    provider: 'gemini-api',
                    proxy: `http://127.0.0.1:${proxyPort}`,
                    providers: {
                        'gemini-api': {
                            apiKey: 'test-key',
                            baseUrl: `http://127.0.0.1:${geminiPort}`,
                        },
                    },
                }),
            );
            const image = path.join(home, 'x.png');
            fs.writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

            try {
                // Async spawn, never the sync runner: spawnSync blocks this
                // process's event loop, freezing the fake servers the CLI must
                // reach, and every request then dies by timeout.
                const { spawn } = await import('child_process');
                const child = spawn(process.execPath, [cli, '-i', image, '-p', 'gemini-api'], {
                    env: baseEnv({ HOME: home, USERPROFILE: home }),
                });
                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (d) => {
                    stdout += d;
                });
                child.stderr.on('data', (d) => {
                    stderr += d;
                });
                const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
                const code = await new Promise((resolve) => child.on('close', resolve));
                clearTimeout(timer);
                // The 3.12.1 bundled dispatcher threw before any request was made
                // (UND_ERR_INVALID_ARG); a same-sourced external undici must both
                // succeed and actually route through the proxy.
                expect(stderr).not.toContain('UND_ERR_INVALID_ARG');
                expect(code).toBe(0);
                expect(JSON.parse(stdout).result.summary).toBe('PROXIED-OK');
                expect(proxied).toBeGreaterThan(0);
            } finally {
                gemini.close();
                proxy.close();
                fs.rmSync(home, { recursive: true, force: true });
            }
        });
    },
);

describe('config set without a value (secret entry)', () => {
    // The chat path cannot be blocked, only not led to: most users will paste
    // a key wherever is convenient. This is the clean path for the ones who
    // care, so the key stays out of argv, shell history, and the transcript.
    function runPiped(args: string[], input: string, home: string) {
        const res = spawnSync(process.execPath, [cli, ...args], {
            encoding: 'utf-8',
            input,
            env: baseEnv({ HOME: home, USERPROFILE: home }),
        });
        return { code: res.status, stdout: res.stdout, stderr: res.stderr };
    }

    it('reads an apiKey from piped stdin when the value is omitted', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-secret-'));
        const out = runPiped(['config', 'set', 'gemini-api.apiKey'], 'sk-piped-secret\n', home);
        expect(out.stderr).toBe('');
        expect(out.code).toBe(0);
        const saved = JSON.parse(
            fs.readFileSync(path.join(home, '.modlens', 'config.json'), 'utf-8'),
        );
        expect(saved.providers['gemini-api'].apiKey).toBe('sk-piped-secret');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('takes only the first line, so a trailing newline or paste artifact is not part of the key', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-secret-'));
        const out = runPiped(['config', 'set', 'openai.apiKey'], '  sk-x  \nleftover\n', home);
        expect(out.code).toBe(0);
        const saved = JSON.parse(
            fs.readFileSync(path.join(home, '.modlens', 'config.json'), 'utf-8'),
        );
        expect(saved.providers.openai.apiKey).toBe('sk-x');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('refuses an empty stdin rather than storing an empty key', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-secret-'));
        const out = runPiped(['config', 'set', 'gemini-api.apiKey'], '', home);
        expect(out.code).toBe(1);
        expect(out.stderr).toContain('no key');
        expect(fs.existsSync(path.join(home, '.modlens', 'config.json'))).toBe(false);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('still requires a value for a field that is not a secret', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-secret-'));
        const out = runPiped(['config', 'set', 'gemini-api.model'], 'whatever\n', home);
        expect(out.code).toBe(1);
        expect(out.stderr).toContain('needs a value');
        fs.rmSync(home, { recursive: true, force: true });
    });
});
