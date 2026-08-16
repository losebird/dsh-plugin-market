import { EnvHttpProxyAgent, ProxyAgent } from 'undici';
import { describe, expect, it } from 'vitest';
import { apiProxyDispatcher, connectFailureHint } from './proxy.ts';

describe('apiProxyDispatcher', () => {
    it('returns undefined when nothing configures a proxy', () => {
        expect(apiProxyDispatcher(undefined, {})).toBeUndefined();
    });

    it('builds a ProxyAgent for an explicit proxy setting', () => {
        const dispatcher = apiProxyDispatcher('http://127.0.0.1:7890', {});
        expect(dispatcher).toBeInstanceOf(ProxyAgent);
    });

    it('honors the standard env vars when no explicit proxy is set', () => {
        for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
            const dispatcher = apiProxyDispatcher(undefined, { [name]: 'http://127.0.0.1:1' });
            expect(dispatcher, name).toBeInstanceOf(EnvHttpProxyAgent);
        }
    });

    it('prefers the explicit setting over env vars', () => {
        const dispatcher = apiProxyDispatcher('http://10.0.0.9:8080', {
            HTTPS_PROXY: 'http://127.0.0.1:1',
        });
        expect(dispatcher).toBeInstanceOf(ProxyAgent);
    });
});

describe('connectFailureHint', () => {
    const connectError = new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    });

    it('turns an opaque connect failure into an actionable proxy hint', () => {
        const hint = connectFailureHint(
            connectError,
            'https://generativelanguage.googleapis.com/v1beta/x',
        );
        expect(hint).toContain('generativelanguage.googleapis.com');
        expect(hint).toContain('HTTPS_PROXY');
        expect(hint).toContain('config set proxy');
    });

    it('stays silent for non-network errors', () => {
        expect(connectFailureHint(new Error('bad json'), 'https://x.example')).toBeNull();
        expect(connectFailureHint(new TypeError('fetch failed'), 'not a url')).toBeNull();
    });
});
