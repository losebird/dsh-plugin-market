import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { discoverAuto, isVisionModel } from './discover.ts';

// A PATH pointing at a directory holding fake executables, same pattern as
// doctor.test.ts: binary detection must not depend on the test machine.
function pathWith(bins: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-auto-bin-'));
    for (const bin of bins) {
        fs.writeFileSync(path.join(dir, bin), '#!/bin/sh\n', { mode: 0o755 });
    }
    return dir;
}

function fakeHome(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-auto-home-'));
}

function probeOf(result: ReturnType<typeof discoverAuto>, harness: string) {
    const probe = result.probes.find((p) => p.harness === harness);
    if (!probe) {
        throw new Error(`probe ${harness} missing`);
    }
    return probe;
}

describe('builtin vision table', () => {
    it('recognizes mainstream vision models case-insensitively', () => {
        expect(isVisionModel('gemini-3.1-pro-high')).toBe(true);
        expect(isVisionModel('Claude-Fable-5')).toBe(true);
        expect(isVisionModel('glm-5v-turbo')).toBe(true);
        expect(isVisionModel('qwen3-vl-32b')).toBe(true);
    });

    it('does not claim text-only coding models', () => {
        expect(isVisionModel('deepseek-v4-flash')).toBe(false);
        expect(isVisionModel('glm-5.2')).toBe(false);
        expect(isVisionModel('minimax-m2.7')).toBe(false);
        expect(isVisionModel('qwen3-coder-plus')).toBe(false);
    });

    it('matches provider-prefixed ids by their bare model id', () => {
        expect(isVisionModel('openrouter/gemini-3-flash')).toBe(true);
        expect(isVisionModel('deepseek/deepseek-chat')).toBe(false);
    });
});

describe('discoverAuto probes', () => {
    it('reports absent CLIs without throwing and finds present ones', () => {
        const home = fakeHome();
        const result = discoverAuto({
            env: { PATH: pathWith(['codex']) },
            home,
            fresh: true,
        });
        expect(probeOf(result, 'codex').cliFound).toBe(true);
        expect(probeOf(result, 'opencode').cliFound).toBe(false);
        expect(probeOf(result, 'pi').cliFound).toBe(false);
        expect(probeOf(result, 'claude-code').cliFound).toBe(false);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('reads the codex model catalog and keeps only image-input models', () => {
        const home = fakeHome();
        fs.mkdirSync(path.join(home, '.codex'));
        const catalog = path.join(home, '.codex', 'models.json');
        fs.writeFileSync(
            catalog,
            JSON.stringify({
                models: [
                    { slug: 'gpt-5.6-sol', input_modalities: ['text', 'image'] },
                    { slug: 'deepseek-v4-flash', input_modalities: ['text'] },
                ],
            }),
        );
        fs.writeFileSync(
            path.join(home, '.codex', 'config.toml'),
            `model = "deepseek-v4-flash"\nmodel_catalog_json = "${catalog}"\n`,
        );
        fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
        const result = discoverAuto({ env: { PATH: pathWith(['codex']) }, home, fresh: true });
        const codex = probeOf(result, 'codex');
        expect(codex.loggedIn).toBe(true);
        expect(codex.visionModels).toEqual(['gpt-5.6-sol']);
        expect(codex.source).toBe('metadata');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('treats an official codex (no third-party provider) as vision-capable by default', () => {
        const home = fakeHome();
        fs.mkdirSync(path.join(home, '.codex'));
        // No model_provider and no model_catalog_json: the stock install, whose
        // default model reads images.
        fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'approval_policy = "never"\n');
        fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
        const result = discoverAuto({ env: { PATH: pathWith(['codex']) }, home, fresh: true });
        const codex = probeOf(result, 'codex');
        expect(codex.loggedIn).toBe(true);
        expect(codex.visionModels).toEqual(['default']);
        expect(codex.source).toBe('builtin-table');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('treats a stock codex with auth but no config.toml as vision-capable', () => {
        const home = fakeHome();
        fs.mkdirSync(path.join(home, '.codex'));
        fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
        const result = discoverAuto({ env: { PATH: pathWith(['codex']) }, home, fresh: true });
        const codex = probeOf(result, 'codex');
        expect(codex.loggedIn).toBe(true);
        expect(codex.visionModels).toEqual(['default']);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('reads the pi models store and keeps vision models whose provider has credentials', () => {
        const home = fakeHome();
        fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
        fs.writeFileSync(
            path.join(home, '.pi', 'agent', 'models-store.json'),
            JSON.stringify({
                google: {
                    models: [
                        { id: 'gemini-3.1-pro', provider: 'google', input: ['text', 'image'] },
                    ],
                },
                deepseek: {
                    models: [
                        { id: 'deepseek-chat', provider: 'deepseek', input: ['text'] },
                        { id: 'deepseek-vl2', provider: 'deepseek', input: ['text', 'image'] },
                    ],
                },
            }),
        );
        // Only deepseek holds a credential, so google's vision model is not borrowable.
        fs.writeFileSync(
            path.join(home, '.pi', 'agent', 'auth.json'),
            JSON.stringify({ deepseek: { type: 'api_key' } }),
        );
        const result = discoverAuto({ env: { PATH: pathWith(['pi']) }, home, fresh: true });
        const pi = probeOf(result, 'pi');
        expect(pi.loggedIn).toBe(true);
        expect(pi.visionModels).toEqual(['deepseek-vl2']);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('probes grok: auth evidence plus models_cache judged by the builtin table', () => {
        const home = fakeHome();
        fs.mkdirSync(path.join(home, '.grok'));
        fs.writeFileSync(
            path.join(home, '.grok', 'auth.json'),
            JSON.stringify({ 'https://auth.x.ai::id': {} }),
        );
        fs.writeFileSync(
            path.join(home, '.grok', 'models_cache.json'),
            JSON.stringify({ models: { 'grok-4.5': {}, 'grok-code-mini': {} } }),
        );
        const result = discoverAuto({ env: { PATH: pathWith(['grok']) }, home, fresh: true });
        const grok = probeOf(result, 'grok');
        expect(grok.loggedIn).toBe(true);
        expect(grok.visionModels).toEqual(['grok-4.5']);
        expect(grok.source).toBe('builtin-table');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('lists opencode models through the CLI and judges them by the builtin table', () => {
        const home = fakeHome();
        const result = discoverAuto({
            env: { PATH: pathWith(['opencode']) },
            home,
            fresh: true,
            runCli: () => 'opencode/gemini-3-flash\ndeepseek/deepseek-chat\n',
        });
        const opencode = probeOf(result, 'opencode');
        expect(opencode.visionModels).toEqual(['opencode/gemini-3-flash']);
        expect(opencode.source).toBe('builtin-table');
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('reports an opencode CLI failure as a probe error, not a crash', () => {
        const home = fakeHome();
        const result = discoverAuto({
            env: { PATH: pathWith(['opencode']) },
            home,
            fresh: true,
            runCli: () => {
                throw new Error('boom');
            },
        });
        const opencode = probeOf(result, 'opencode');
        expect(opencode.visionModels).toEqual([]);
        expect(opencode.error).toContain('boom');
        fs.rmSync(home, { recursive: true, force: true });
    });
});

describe('discoverAuto cache', () => {
    it('writes the cache on a fresh probe and serves from it within the TTL', () => {
        const home = fakeHome();
        const env = { PATH: pathWith(['codex']) };
        const first = discoverAuto({ env, home, fresh: true });
        expect(first.fromCache).toBe(false);
        const second = discoverAuto({ env: { PATH: '' }, home });
        // Served from cache: the emptied PATH did not change the answer.
        expect(second.fromCache).toBe(true);
        expect(probeOf(second, 'codex').cliFound).toBe(true);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('rejects a cache whose timestamp does not parse instead of keeping it forever', () => {
        const home = fakeHome();
        const cachePath = path.join(home, '.modlens', 'auto-cache.json');
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ cachedAt: 'not-a-date', probes: [] }));
        const result = discoverAuto({ env: { PATH: '' }, home });
        expect(result.fromCache).toBe(false);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('re-probes past the TTL and on fresh:true', () => {
        const home = fakeHome();
        const env = { PATH: pathWith(['codex']) };
        discoverAuto({ env, home, fresh: true });
        const expired = discoverAuto({ env: { PATH: '' }, home, ttlMs: -1 });
        expect(expired.fromCache).toBe(false);
        expect(probeOf(expired, 'codex').cliFound).toBe(false);
        const forced = discoverAuto({ env, home, fresh: true });
        expect(forced.fromCache).toBe(false);
        fs.rmSync(home, { recursive: true, force: true });
    });
});
