import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    fetchRemoteImageBase64,
    MAX_REMOTE_IMAGE_BYTES,
    mimeTypeFor,
    readLocalImageBase64,
    resolveImageMime,
} from './imageInput.ts';

// The production download path uses undici's own fetch (same-sourced with its
// pinned dispatcher); tests bridge it back to the global fetch so the existing
// vi.stubGlobal('fetch') doubles keep working.
vi.mock('undici', async (importOriginal) => {
    const real = await importOriginal<typeof import('undici')>();
    return {
        ...real,
        fetch: (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args),
    };
});

// The download path resolves every hostname before fetching (see net/network),
// so the fake hosts these tests use must resolve to a public address, and one
// test host resolves to a private one to prove the rejection.
vi.mock('dns/promises', () => ({
    lookup: vi.fn(async (hostname: string) =>
        hostname === 'internal.example'
            ? [{ address: '10.0.0.1', family: 4 }]
            : [{ address: '203.0.113.7', family: 4 }],
    ),
}));

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('mimeTypeFor', () => {
    it('maps common extensions', () => {
        expect(mimeTypeFor('/a/b/photo.PNG')).toBe('image/png');
        expect(mimeTypeFor('shot.jpeg')).toBe('image/jpeg');
        expect(mimeTypeFor('anim.webp')).toBe('image/webp');
    });

    it('handles urls with query strings and unknown extensions', () => {
        expect(mimeTypeFor('https://x.example.com/pic.png?w=100')).toBe('image/png');
        expect(mimeTypeFor('/tmp/mystery.bin')).toBe('image/jpeg');
    });

    it('keeps the extension of local paths containing # or ?', () => {
        // new URL() would read these as a fragment/query and lose the extension.
        expect(mimeTypeFor('/tmp/shot#2.png')).toBe('image/png');
        expect(mimeTypeFor('/tmp/report?draft.webp')).toBe('image/webp');
    });
});

describe('resolveImageMime', () => {
    const html = Buffer.from('<!doctype html><html>not an image</html>');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

    it('refuses sniffable types whose bytes fail the header check', () => {
        // An .png URL serving HTML must not be relabelled image/png by its
        // extension or by a lying content-type header.
        expect(() => resolveImageMime(html, 'https://x/not-image.png')).toThrow(
            /does not look like a supported image/,
        );
        expect(() => resolveImageMime(html, 'https://x/not-image.png', 'image/png')).toThrow(
            /does not look like a supported image/,
        );
        expect(() => resolveImageMime(html, '/tmp/renamed.jpg')).toThrow(
            /does not look like a supported image/,
        );
    });

    it('identifies heic/heif from the ftyp box and refuses fakes wearing the extension', () => {
        const heic = Buffer.concat([
            Buffer.from([0, 0, 0, 24]),
            Buffer.from('ftypheic'),
            Buffer.from([0, 0, 0, 0]),
        ]);
        const heif = Buffer.concat([
            Buffer.from([0, 0, 0, 24]),
            Buffer.from('ftypmif1'),
            Buffer.from([0, 0, 0, 0]),
        ]);
        expect(resolveImageMime(heic, '/tmp/photo.heic')).toBe('image/heic');
        expect(resolveImageMime(heif, 'https://x/pic')).toBe('image/heif');
        // HTML wearing .heic or a lying content-type no longer passes.
        expect(() => resolveImageMime(html, '/tmp/photo.heic')).toThrow(
            /does not look like a supported image/,
        );
        expect(() => resolveImageMime(html, 'https://x/pic', 'image/heif')).toThrow(
            /does not look like a supported image/,
        );
    });

    it('trusts the header over everything when it matches', () => {
        expect(resolveImageMime(png, 'https://x/no-extension')).toBe('image/png');
        expect(resolveImageMime(png, '/tmp/misnamed.jpg')).toBe('image/png');
    });
});

describe('readLocalImageBase64', () => {
    const dirs: string[] = [];
    afterEach(() => {
        while (dirs.length > 0) {
            fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
        }
    });
    function tmpFile(name: string, bytes: Buffer): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-img-'));
        dirs.push(dir);
        const file = path.join(dir, name);
        fs.writeFileSync(file, bytes);
        return file;
    }

    it('reads bytes and pairs them with the sniffed mime', () => {
        const image = readLocalImageBase64(tmpFile('x.png', PNG_MAGIC));
        expect(image.mimeType).toBe('image/png');
        expect(Buffer.from(image.data, 'base64')).toEqual(PNG_MAGIC);
    });

    it('trusts the file header over a faked extension', () => {
        // JPEG bytes wearing a .png name: the magic wins, not the extension.
        const image = readLocalImageBase64(tmpFile('screenshot.png', JPEG_MAGIC));
        expect(image.mimeType).toBe('image/jpeg');
    });

    it('rejects a local image over the byte limit before reading it', () => {
        // A sparse file: truncate stretches the size without writing bytes, so
        // the stat-based cap must fire before any read is attempted.
        const file = tmpFile('huge.png', Buffer.alloc(0));
        fs.truncateSync(file, MAX_REMOTE_IMAGE_BYTES + 1);
        expect(() => readLocalImageBase64(file)).toThrow(/over the .* limit/);
    });

    it('rejects a type that is neither recognizable nor allow-listed', () => {
        expect(() => readLocalImageBase64(tmpFile('mystery.bin', Buffer.from('nope')))).toThrow(
            /does not look like a supported image/,
        );
    });
});

describe('fetchRemoteImageBase64', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects a literal loopback target before any request goes out', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        await expect(fetchRemoteImageBase64('http://127.0.0.1/x.png', 1000)).rejects.toThrow(
            /Blocked private or reserved image target/,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects localhost and cloud metadata targets', async () => {
        await expect(fetchRemoteImageBase64('http://localhost/x.png', 1000)).rejects.toThrow(
            /Blocked/,
        );
        await expect(
            fetchRemoteImageBase64('http://169.254.169.254/latest/meta-data', 1000),
        ).rejects.toThrow(/Blocked private or reserved image target/);
    });

    it('rejects a public-looking hostname that resolves to a private address', async () => {
        await expect(
            fetchRemoteImageBase64('https://internal.example/shot.png', 1000),
        ).rejects.toThrow(/internal\.example -> 10\.0\.0\.1/);
    });

    it('re-validates every redirect hop and rejects one that lands private', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { location: 'http://127.0.0.1/steal' },
                }),
        );
        await expect(fetchRemoteImageBase64('https://x.example/a.png', 1000)).rejects.toThrow(
            /Blocked private or reserved image target/,
        );
    });

    it('rejects a non-http scheme and embedded credentials', async () => {
        await expect(fetchRemoteImageBase64('file:///etc/passwd', 1000)).rejects.toThrow(
            /Only http\/https/,
        );
        await expect(
            fetchRemoteImageBase64('https://user:pw@x.example/a.png', 1000),
        ).rejects.toThrow(/embedded credentials/);
    });

    it('never quotes query strings (signed tokens) in download errors', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response('<html>definitely not an image</html>', {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                }),
        );
        const error = await fetchRemoteImageBase64(
            'https://img.example/doc.png?X-Amz-Signature=TOP_SECRET_123',
            1000,
        ).catch((e: Error) => e.message);
        expect(error).toContain('does not look like a supported image');
        expect(error).toContain('https://img.example/doc.png');
        expect(error).not.toContain('TOP_SECRET_123');
    });

    it('rejects a download whose content-length is over the limit', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(PNG_MAGIC, {
                    status: 200,
                    headers: {
                        'content-type': 'image/png',
                        'content-length': String(MAX_REMOTE_IMAGE_BYTES + 1),
                    },
                }),
        );
        await expect(fetchRemoteImageBase64('https://x.example/big.png', 1000)).rejects.toThrow(
            /over the .* limit/,
        );
    });

    it('aborts a stream that exceeds the limit with no content-length', async () => {
        let sent = 0;
        const stream = new ReadableStream({
            pull(controller) {
                if (sent >= MAX_REMOTE_IMAGE_BYTES + 4 * 1024 * 1024) {
                    controller.close();
                    return;
                }
                const chunk = new Uint8Array(1024 * 1024);
                sent += chunk.byteLength;
                controller.enqueue(chunk);
            },
        });
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } }),
        );
        await expect(fetchRemoteImageBase64('https://x.example/stream', 5000)).rejects.toThrow(
            /exceeds the .* limit/,
        );
    });

    it('sniffs the media type from the bytes, ignoring a lying content-type', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(PNG_MAGIC, {
                    status: 200,
                    headers: { 'content-type': 'image/jpeg' },
                }),
        );
        const image = await fetchRemoteImageBase64('https://x.example/a', 1000);
        expect(image.mimeType).toBe('image/png');
    });

    it('rejects an unrecognized, non-image payload', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(Buffer.from('%PDF-1.4'), {
                    status: 200,
                    headers: { 'content-type': 'application/pdf' },
                }),
        );
        await expect(fetchRemoteImageBase64('https://x.example/doc', 1000)).rejects.toThrow(
            /does not look like a supported image/,
        );
    });
});
