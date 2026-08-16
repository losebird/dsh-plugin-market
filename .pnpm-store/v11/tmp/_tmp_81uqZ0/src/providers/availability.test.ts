import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { findOnPath, providerAvailable, providerChain } from './availability.ts';

const dirs: string[] = [];
afterEach(() => {
    while (dirs.length > 0) {
        fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
    }
});

/** A PATH containing the named fake binaries and nothing else. */
function pathWith(...bins: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-avail-'));
    dirs.push(dir);
    for (const bin of bins) {
        fs.writeFileSync(path.join(dir, bin), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
    return dir;
}

const names = (chain: ReturnType<typeof providerChain>) => chain.map((p) => p.name);

describe('providerAvailable', () => {
    it('checks the binary on PATH for subprocess providers', () => {
        expect(providerAvailable('antigravity-cli', {}, { PATH: pathWith('agy') })).toBe(true);
        expect(providerAvailable('antigravity-cli', {}, { PATH: pathWith() })).toBe(false);
    });

    // Real Windows installs ship agy.exe / claude.cmd, never a bare-named
    // file; these run on the Windows CI matrix only.
    it.skipIf(process.platform !== 'win32')('finds Windows binaries via PATHEXT', () => {
        expect(providerAvailable('antigravity-cli', {}, { PATH: pathWith('agy.exe') })).toBe(true);
        expect(
            providerAvailable(
                'claude-cli',
                {},
                {
                    PATH: pathWith('claude.cmd'),
                    PATHEXT: '.COM;.EXE;.BAT;.CMD',
                },
            ),
        ).toBe(true);
        expect(providerAvailable('antigravity-cli', {}, { PATH: pathWith('agy.xyz') })).toBe(false);
    });

    it.skipIf(process.platform !== 'win32')(
        'prefers the executable extension over an npm POSIX shim (#30)',
        () => {
            // npm installs a bare-named sh shim right next to opencode.cmd;
            // resolving the bare file first hands spawnSync something Windows
            // cannot execute.
            const dir = pathWith('opencode', 'opencode.cmd', 'opencode.ps1');
            const found = findOnPath('opencode', {
                PATH: dir,
                PATHEXT: '.COM;.EXE;.BAT;.CMD',
            });
            expect(found?.toLowerCase().endsWith('opencode.cmd')).toBe(true);
        },
    );

    it('requires every setting for openai, not just the key', () => {
        const env = { PATH: pathWith() };
        const partial = { providers: { openai: { apiKey: 'k', baseUrl: 'https://x' } } };
        expect(providerAvailable('openai', partial, env)).toBe(false);
        const full = {
            providers: { openai: { apiKey: 'k', baseUrl: 'https://x', model: 'm' } },
        };
        expect(providerAvailable('openai', full, env)).toBe(true);
    });

    it('reads keys from the environment as well as the config', () => {
        expect(providerAvailable('gemini-api', {}, { PATH: pathWith(), GEMINI_API_KEY: 'g' })).toBe(
            true,
        );
        expect(providerAvailable('unknown-provider', {}, { PATH: pathWith() })).toBe(false);
    });
});

describe('providerChain', () => {
    const allKeys = {
        providers: {
            'gemini-api': { apiKey: 'g' },
            openai: { apiKey: 'o', baseUrl: 'https://x', model: 'm' },
            anthropic: { apiKey: 'a' },
        },
    };

    it('orders a fully configured local chain inline-first, agents behind', () => {
        const env = { PATH: pathWith('agy', 'claude') };
        expect(names(providerChain('local', allKeys, env))).toEqual([
            'gemini-api',
            'openai',
            'anthropic',
            'antigravity-cli',
            'claude-cli',
        ]);
    });

    it('orders the remote chain inline-first and never includes claude-cli', () => {
        const env = { PATH: pathWith('agy', 'claude') };
        expect(names(providerChain('remote', allKeys, env))).toEqual([
            'gemini-api',
            'openai',
            'anthropic',
            'antigravity-cli',
        ]);
    });

    it('filters out providers that are not set up', () => {
        const env = { PATH: pathWith() };
        const geminiOnly = { providers: { 'gemini-api': { apiKey: 'g' } } };
        expect(names(providerChain('local', geminiOnly, env))).toEqual(['gemini-api']);
        expect(names(providerChain('local', {}, env))).toEqual([]);
    });

    it('moves a configured default to the front of the local chain', () => {
        const env = { PATH: pathWith('agy') };
        const prefer = { ...allKeys, provider: 'anthropic' };
        expect(names(providerChain('local', prefer, env))).toEqual([
            'anthropic',
            'gemini-api',
            'openai',
            'antigravity-cli',
        ]);
    });

    it('keeps a configured agent default behind the inline providers for remote URLs', () => {
        const env = { PATH: pathWith('agy') };
        const prefer = { ...allKeys, provider: 'antigravity-cli' };
        expect(names(providerChain('remote', prefer, env))).toEqual([
            'gemini-api',
            'openai',
            'anthropic',
            'antigravity-cli',
        ]);
    });

    it('moves a configured inline default to the front of the remote chain', () => {
        const env = { PATH: pathWith('agy') };
        const prefer = { ...allKeys, provider: 'anthropic' };
        expect(names(providerChain('remote', prefer, env))).toEqual([
            'anthropic',
            'gemini-api',
            'openai',
            'antigravity-cli',
        ]);
    });

    it('ignores an unknown configured default', () => {
        const env = { PATH: pathWith() };
        const broken = { providers: { 'gemini-api': { apiKey: 'g' } }, provider: 'no-such' };
        expect(names(providerChain('local', broken, env))).toEqual(['gemini-api']);
    });
});
