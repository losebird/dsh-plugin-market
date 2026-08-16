import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
    CONFIG_TEMPLATE,
    defaultProviderName,
    initConfigFile,
    loadConfigFile,
    renderEffectiveConfig,
    resolveProviderSettings,
    setConfigValue,
} from './config.ts';

describe('defaultProviderName', () => {
    it('falls back to antigravity-cli without config', () => {
        expect(defaultProviderName({})).toBe('antigravity-cli');
        expect(defaultProviderName({ provider: '  ' })).toBe('antigravity-cli');
    });

    it('honors an explicit provider', () => {
        expect(defaultProviderName({ provider: 'gemini-api' })).toBe('gemini-api');
    });
});

describe('resolveProviderSettings', () => {
    it('env vars override config file values, unbound fields pass through', () => {
        const settings = resolveProviderSettings(
            'gemini-api',
            { providers: { 'gemini-api': { apiKey: 'from-file', model: 'm1' } } },
            { GEMINI_API_KEY: 'from-env' },
        );
        expect(settings.apiKey).toBe('from-env');
        expect(settings.model).toBe('m1');
    });

    it('binds openai and anthropic base urls from env', () => {
        const settings = resolveProviderSettings(
            'openai',
            {},
            {
                OPENAI_API_KEY: 'k',
                OPENAI_BASE_URL: 'https://gw.example.com/v1',
            },
        );
        expect(settings.baseUrl).toBe('https://gw.example.com/v1');
    });
});

describe('setConfigValue + loadConfigFile + renderEffectiveConfig', () => {
    it('round-trips dotted keys and masks keys on render', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('provider', 'gemini-api', file);
        setConfigValue('gemini-api.apiKey', 'AIzaSecretSecret123', file);
        const loaded = loadConfigFile(file);
        expect(loaded.provider).toBe('gemini-api');
        expect(loaded.providers?.['gemini-api']?.apiKey).toBe('AIzaSecretSecret123');
        expect(renderEffectiveConfig(loaded, {})).not.toContain('SecretSecret');
        expect(() => setConfigValue('gemini-api.password', 'x', file)).toThrow(
            'Unknown config field',
        );
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('merges env vars over the file and labels each value source', () => {
        const rendered = renderEffectiveConfig(
            { provider: 'gemini-api', providers: { 'gemini-api': { model: 'm1' } } },
            { GEMINI_API_KEY: 'AIzaFromEnv12345' },
        );
        const parsed = JSON.parse(rendered) as {
            provider?: string;
            providers: Record<string, Record<string, string>>;
        };
        expect(parsed.provider).toBe('gemini-api');
        // apiKey came from the environment, masked, and tagged env.
        expect(parsed.providers['gemini-api'].apiKey).toMatch(/\(env\)$/);
        expect(parsed.providers['gemini-api'].apiKey).not.toContain('FromEnv');
        // model came from the file, tagged file.
        expect(parsed.providers['gemini-api'].model).toBe('m1 (file)');
    });

    it('masks proxy credentials everywhere config show renders them', () => {
        // config show output is written to be pasted into issues; a proxy
        // URL's userinfo is a credential exactly like an apiKey.
        const fromFile = JSON.parse(
            renderEffectiveConfig(
                {
                    proxy: 'http://alice:s3cr3t@proxy.example:8080',
                    providers: { openai: { proxy: 'socks5://bob:hunter2@10.0.0.1:1080' } },
                },
                {},
            ),
        ) as { proxy?: string; providers: Record<string, Record<string, string>> };
        expect(fromFile.proxy).toBe('http://***@proxy.example:8080/ (file)');
        expect(fromFile.providers.openai.proxy).toBe('socks5://***@10.0.0.1:1080 (file)');
        expect(JSON.stringify(fromFile)).not.toContain('s3cr3t');
        expect(JSON.stringify(fromFile)).not.toContain('hunter2');

        const fromEnv = JSON.parse(
            renderEffectiveConfig({}, { HTTPS_PROXY: 'http://carol:t0ps3cret@proxy.example:8080' }),
        ) as { proxy?: string };
        expect(fromEnv.proxy).toBe('http://***@proxy.example:8080/ (env)');

        // A proxy without credentials renders untouched.
        const plain = JSON.parse(
            renderEffectiveConfig({ proxy: 'http://proxy.example:8080' }, {}),
        ) as { proxy?: string };
        expect(plain.proxy).toBe('http://proxy.example:8080 (file)');
    });

    it('stores extraBody as parsed JSON, clears it on an empty value, and shows it', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('openai.extraBody', '{"thinking":{"type":"disabled"}}', file);
        // An object, not the string: the provider merges it into the request body.
        expect(loadConfigFile(file).providers?.openai?.extraBody).toEqual({
            thinking: { type: 'disabled' },
        });
        const rendered = JSON.parse(renderEffectiveConfig(loadConfigFile(file), {})) as {
            providers: Record<string, Record<string, string>>;
        };
        expect(rendered.providers.openai.extraBody).toBe('{"thinking":{"type":"disabled"}} (file)');
        expect(() => setConfigValue('openai.extraBody', '{oops', file)).toThrow(
            'openai.extraBody is not valid JSON',
        );
        setConfigValue('openai.extraBody', '', file);
        expect(loadConfigFile(file).providers?.openai?.extraBody).toBeUndefined();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('rejects malformed json with a fix hint', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        fs.writeFileSync(file, '{broken');
        expect(() => loadConfigFile(file)).toThrow('Fix or delete the file');
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('guards config', () => {
    it('round-trips guards.denyModels from a JSON array or a comma list', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('guards.denyModels', '["gemini-3*", "gpt-5.6*"]', file);
        expect(loadConfigFile(file).guards?.denyModels).toEqual(['gemini-3*', 'gpt-5.6*']);
        setConfigValue('guards.denyModels', 'claude-*, qwen-vl-*', file);
        expect(loadConfigFile(file).guards?.denyModels).toEqual(['claude-*', 'qwen-vl-*']);
        // An empty value clears the list without hand-editing the file.
        setConfigValue('guards.denyModels', '', file);
        expect(loadConfigFile(file).guards?.denyModels).toBeUndefined();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('records per-harness reuse decisions as strict booleans, empty clears', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('reuse.codex', 'true', file);
        setConfigValue('reuse.pi', 'false', file);
        expect(loadConfigFile(file).reuse).toEqual({ codex: true, pi: false });
        setConfigValue('reuse.codex', '', file);
        expect(loadConfigFile(file).reuse).toEqual({ pi: false });
        expect(() => setConfigValue('reuse.codex', 'maybe', file)).toThrow('true or false');
        expect(() => setConfigValue('reuse.gemini', 'true', file)).toThrow('Unknown reuse');
        // auto never shipped; it is just an unknown key like any other.
        expect(() => setConfigValue('auto', 'true', file)).toThrow('Invalid config key');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('round-trips guards.allowModels the same way', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('guards.allowModels', '["deepseek-v4-*", "glm-5.*"]', file);
        expect(loadConfigFile(file).guards?.allowModels).toEqual(['deepseek-v4-*', 'glm-5.*']);
        setConfigValue('guards.allowModels', 'minimax-m2.5*, qwen3-coder*', file);
        expect(loadConfigFile(file).guards?.allowModels).toEqual(['minimax-m2.5*', 'qwen3-coder*']);
        setConfigValue('guards.allowModels', '', file);
        expect(loadConfigFile(file).guards?.allowModels).toBeUndefined();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('renders reuse decisions and allowModels in the effective config', async () => {
        const { renderEffectiveConfig } = await import('./config.ts');
        const rendered = renderEffectiveConfig(
            { reuse: { codex: false, pi: true }, guards: { allowModels: ['deepseek-v4-*'] } },
            {},
        );
        expect(rendered).toContain('"codex": "false (file)"');
        expect(rendered).toContain('"pi": "true (file)"');
        expect(rendered).toContain('allowModels');
    });

    it('parses guards.denyWhenUnknown as a boolean and rejects other fields', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('guards.denyWhenUnknown', 'true', file);
        expect(loadConfigFile(file).guards?.denyWhenUnknown).toBe(true);
        setConfigValue('guards.denyWhenUnknown', 'false', file);
        expect(loadConfigFile(file).guards?.denyWhenUnknown).toBe(false);
        expect(() => setConfigValue('guards.denyWhenUnknown', 'maybe', file)).toThrow(
            'true or false',
        );
        expect(() => setConfigValue('guards.nope', 'x', file)).toThrow('Unknown guards field');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('shows guards in the effective config render', () => {
        const rendered = renderEffectiveConfig(
            { guards: { denyModels: ['gemini-3*'], denyWhenUnknown: true } },
            {},
        );
        const parsed = JSON.parse(rendered) as { guards?: Record<string, string> };
        expect(parsed.guards?.denyModels).toBe('["gemini-3*"] (file)');
        expect(parsed.guards?.denyWhenUnknown).toBe('true (file)');
    });
});

describe('initConfigFile', () => {
    it('writes the starter template and refuses to overwrite without force', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-init-'));
        const file = path.join(dir, 'config.json');
        initConfigFile(file);
        expect(loadConfigFile(file)).toEqual(CONFIG_TEMPLATE);
        expect(() => initConfigFile(file)).toThrow('already exists');
        initConfigFile(file, true);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('structuredOutput (#37)', () => {
    it('stores a boolean and clears on empty', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-so-'));
        const file = path.join(dir, 'config.json');
        setConfigValue('openai.structuredOutput', 'true', file);
        expect(loadConfigFile(file).providers?.openai?.structuredOutput).toBe(true);
        setConfigValue('openai.structuredOutput', 'false', file);
        expect(loadConfigFile(file).providers?.openai?.structuredOutput).toBe(false);
        setConfigValue('openai.structuredOutput', '', file);
        expect(loadConfigFile(file).providers?.openai?.structuredOutput).toBeUndefined();
    });

    it('shows in the effective config, both ways', () => {
        for (const value of [true, false]) {
            const rendered = renderEffectiveConfig({
                providers: { openai: { structuredOutput: value } },
            });
            expect(JSON.parse(rendered).providers.openai.structuredOutput).toBe(`${value} (file)`);
        }
        expect(
            JSON.parse(renderEffectiveConfig({ providers: { openai: { model: 'x' } } })).providers
                .openai.structuredOutput,
        ).toBeUndefined();
    });

    it('refuses it on a provider that would never read it', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-so-'));
        const file = path.join(dir, 'config.json');
        expect(() => setConfigValue('anthropic.structuredOutput', 'true', file)).toThrow(
            /openai provider only/,
        );
        // The alias resolves to openai, so it is accepted.
        expect(() => setConfigValue('openai-compat.structuredOutput', 'true', file)).not.toThrow();
    });

    it('refuses a value that is neither true nor false', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-so-'));
        const file = path.join(dir, 'config.json');
        expect(() => setConfigValue('openai.structuredOutput', 'yes', file)).toThrow(
            /must be true or false/,
        );
    });
});
