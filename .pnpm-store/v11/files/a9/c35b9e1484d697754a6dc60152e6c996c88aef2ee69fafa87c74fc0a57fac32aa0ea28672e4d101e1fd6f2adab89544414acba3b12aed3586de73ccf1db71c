import * as http from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchRemoteImageBase64 } from './imageInput.ts';

// The point of this file is what it does NOT mock: undici. The sibling suite
// bridges undici.fetch back to the global fetch to reuse its stubs, which
// also means it can never catch a dispatcher/fetch source mismatch — the
// exact defect of issue #23. Here the download runs through the real undici
// fetch and the real IP-pinned Agent against a real local server; only the
// SSRF resolution boundary is mocked, steering the "validated address" to
// that local server.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
let port = 0;

vi.mock('./net/network.ts', async (importOriginal) => {
    const real = await importOriginal<typeof import('./net/network.ts')>();
    return {
        ...real,
        assertSafeRemoteTarget: async (url: URL) => ({
            hostname: url.hostname,
            address: '127.0.0.1',
            family: 4,
        }),
    };
});

let server: http.Server;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.url?.endsWith('/redirect')) {
            res.writeHead(302, { location: `http://public.example:${port}/real.png` });
            res.end();
            return;
        }
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(PNG);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
});

afterAll(() => {
    server.close();
});

describe('fetchRemoteImageBase64 over the real undici stack (#23)', () => {
    it('downloads through the same-sourced pinned Agent and fetch', async () => {
        const image = await fetchRemoteImageBase64(`http://public.example:${port}/real.png`, 5000);
        expect(image.mimeType).toBe('image/png');
        expect(Buffer.from(image.data, 'base64')).toEqual(PNG);
    });

    it('follows a redirect hop with a fresh pinned dispatcher', async () => {
        const image = await fetchRemoteImageBase64(`http://public.example:${port}/redirect`, 5000);
        expect(image.mimeType).toBe('image/png');
    });
});
