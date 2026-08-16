import * as fs from 'fs';
import * as path from 'path';
import { Agent, fetch as undiciFetch } from 'undici';
import {
    assertSafeRemoteTarget,
    normalizeRemoteImageUrl,
    type PinnedTarget,
} from './net/network.ts';

export const MIME_BY_EXT: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
};

// A remote image is pulled fully into memory and base64-encoded, so an
// unbounded download is a memory-exhaustion vector. 25 MB comfortably clears a
// dense screenshot or a high-res photo while capping the damage.
export const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;

// Types we are willing to hand to a provider. Every one of them is confirmed
// from its file header (heic/heif via the ftyp box); no extension trust.
export const ALLOWED_MIME = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
]);

const SNIFFERS: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
    {
        mime: 'image/png',
        test: (b) =>
            b.length >= 8 &&
            b[0] === 0x89 &&
            b[1] === 0x50 &&
            b[2] === 0x4e &&
            b[3] === 0x47 &&
            b[4] === 0x0d &&
            b[5] === 0x0a &&
            b[6] === 0x1a &&
            b[7] === 0x0a,
    },
    {
        mime: 'image/jpeg',
        test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    },
    {
        mime: 'image/gif',
        test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)),
    },
    {
        mime: 'image/webp',
        test: (b) =>
            b.length >= 12 &&
            b.toString('ascii', 0, 4) === 'RIFF' &&
            b.toString('ascii', 8, 12) === 'WEBP',
    },
    // ISO BMFF: bytes 4-8 spell "ftyp" and the brand names the format. This
    // closes the last extension-trust hole: heic/heif must now prove
    // themselves from the header like every other type.
    {
        mime: 'image/heic',
        test: (b) =>
            b.length >= 12 &&
            b.toString('ascii', 4, 8) === 'ftyp' &&
            ['heic', 'heix', 'hevc', 'hevx'].includes(b.toString('ascii', 8, 12)),
    },
    {
        mime: 'image/heif',
        test: (b) =>
            b.length >= 12 &&
            b.toString('ascii', 4, 8) === 'ftyp' &&
            ['mif1', 'msf1', 'heif'].includes(b.toString('ascii', 8, 12)),
    },
];

/**
 * A URL safe to quote in an error message: origin and path only. Query strings
 * carry signed tokens (S3 presigns, SAS signatures) that must not travel into
 * meta.attempts, model contexts, or logs.
 */
function safeUrl(url: string): string {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    } catch {
        return '<unparseable url>';
    }
}

/** Confirm an image type from its file header, or null if unrecognized. */
export function sniffImageMime(buffer: Buffer): string | null {
    for (const { mime, test } of SNIFFERS) {
        if (test(buffer)) {
            return mime;
        }
    }
    return null;
}

function extMime(source: string): string | null {
    // Local paths go straight through path.extname. Routing them through new URL
    // truncated the extension at a literal # or ? (a fragment/query only exists
    // in URLs), so /tmp/shot#2.png fell back to the wrong type. Only remote URLs,
    // where a query string is real, get URL parsing.
    const ext = /^https?:\/\//i.test(source)
        ? path.extname(new URL(source).pathname).toLowerCase()
        : path.extname(source).toLowerCase();
    return MIME_BY_EXT[ext] ?? null;
}

export function mimeTypeFor(source: string): string {
    return extMime(source) ?? 'image/jpeg';
}

/**
 * Decide the media type from the bytes alone. The file header wins because it
 * cannot be faked by renaming a file or by a lying server, and every allowed
 * type (heic/heif included, via their ftyp box) is identifiable from its
 * header, so there is no extension or content-type fallback left: content
 * whose bytes match no known image header is refused, whatever the URL
 * extension or the server claims.
 */
export function resolveImageMime(buffer: Buffer, source: string, _contentType?: string): string {
    const sniffed = sniffImageMime(buffer);
    if (sniffed) {
        return sniffed;
    }
    throw new Error(
        `Content of ${source} does not look like a supported image (its bytes match no known image header). Allowed types: ${[...ALLOWED_MIME].join(', ')}.`,
    );
}

export function readLocalImageBase64(filePath: string): { data: string; mimeType: string } {
    // Same cap as remote downloads: the bytes are read whole and base64-encoded
    // in memory, so an unbounded local file is the same exhaustion vector with
    // a different source. Checked via stat, before any byte is read.
    const size = fs.statSync(filePath).size;
    if (size > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error(
            `Image is ${size} bytes, over the ${MAX_REMOTE_IMAGE_BYTES}-byte limit: ${filePath}`,
        );
    }
    const buffer = fs.readFileSync(filePath);
    const mimeType = resolveImageMime(buffer, filePath);
    return { data: buffer.toString('base64'), mimeType };
}

const MAX_REDIRECTS = 5;

/**
 * Download a remote image, for APIs that only accept inline bytes. This is an
 * SSRF-plus-exfiltration surface: the URL may have come from untrusted text,
 * and whatever it serves is uploaded to a vision provider. So every hop is
 * validated against private and reserved targets, and the connection is pinned
 * to the exact IP the check validated, closing DNS rebinding.
 */
export async function fetchRemoteImageBase64(
    url: string,
    timeoutMs: number,
): Promise<{ data: string; mimeType: string }> {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = normalizeRemoteImageUrl(url);
    // Every pinned dispatcher created along the way, closed when the run ends.
    const dispatchers: Agent[] = [];

    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const pinned = await assertSafeRemoteTarget(current);
            const dispatcher = pinnedDispatcher(pinned);
            dispatchers.push(dispatcher);

            // undici's own fetch, never the host's: the pinned dispatcher is
            // an undici-8 Agent, and handing it to the built-in fetch of a
            // different undici major fails with UND_ERR_INVALID_ARG — the
            // same cross-version boundary issue #23 hit on the proxy path.
            const response = (await undiciFetch(current, {
                method: 'GET',
                redirect: 'manual',
                signal: signal as Parameters<typeof undiciFetch>[1] extends { signal?: infer S }
                    ? S
                    : never,
                dispatcher,
            })) as unknown as Response;

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) {
                    await response.body?.cancel().catch(() => {});
                    throw new Error(
                        `Redirect response (${response.status}) missing location header: ${safeUrl(current.toString())}`,
                    );
                }
                await response.body?.cancel();
                if (hop === MAX_REDIRECTS) {
                    throw new Error(`Too many redirects (max ${MAX_REDIRECTS}): ${safeUrl(url)}`);
                }
                // The next hop is a fresh target: re-normalized, re-validated,
                // re-pinned at the top of the loop.
                current = normalizeRemoteImageUrl(new URL(location, current).toString());
                continue;
            }

            // The early-exit throws cancel the body first: an error response
            // can stream (or stall) indefinitely, and an active body keeps
            // the agent's socket — and with it this process — alive after the
            // error was already reported.
            if (!response.ok) {
                await response.body?.cancel().catch(() => {});
                throw new Error(
                    `Failed to download image (${response.status}): ${safeUrl(current.toString())}`,
                );
            }

            // Trust the advertised size to reject an oversized download before
            // reading a single byte, then enforce the same limit while
            // streaming, because content-length can be absent or a lie.
            const declaredLength = Number(response.headers.get('content-length'));
            if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
                await response.body?.cancel().catch(() => {});
                throw new Error(
                    `Remote image is ${declaredLength} bytes, over the ${MAX_REMOTE_IMAGE_BYTES}-byte limit: ${safeUrl(current.toString())}`,
                );
            }

            const finalUrl = current.toString();
            const buffer = await readCapped(response, finalUrl);
            const contentType = response.headers.get('content-type') ?? undefined;
            // safeUrl: the sniff-failure error quotes its source, and the
            // final URL can carry signed query tokens.
            const mimeType = resolveImageMime(buffer, safeUrl(finalUrl), contentType);
            return { data: buffer.toString('base64'), mimeType };
        }
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS}): ${safeUrl(url)}`);
    } finally {
        // Awaited, not fire-and-forget: close() resolves when the pool has
        // actually let go of its sockets, which is what lets a standalone CLI
        // exit instead of idling on a kept-alive connection.
        await Promise.allSettled(dispatchers.map((dispatcher) => dispatcher.close()));
    }
}

/**
 * An undici dispatcher whose DNS lookup is hard-wired to the one IP the safety
 * check validated, while the hostname stays in place for Host and TLS SNI.
 */
function pinnedDispatcher(pinned: PinnedTarget): Agent {
    return new Agent({
        connect: {
            lookup: (_hostname, options, callback) => {
                const record = { address: pinned.address, family: pinned.family };
                // undici asks with { all: true } and expects an array; be
                // tolerant of the single-record signature too.
                if (options && (options as { all?: boolean }).all) {
                    (
                        callback as (
                            err: Error | null,
                            addresses: Array<{ address: string; family: number }>,
                        ) => void
                    )(null, [record]);
                } else {
                    (callback as (err: Error | null, address: string, family: number) => void)(
                        null,
                        pinned.address,
                        pinned.family,
                    );
                }
            },
        },
    });
}

async function readCapped(response: Response, url: string): Promise<Buffer> {
    const body = response.body;
    if (!body) {
        // No stream to meter (e.g. a mocked Response): read then check.
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error(
                `Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES}-byte limit: ${safeUrl(url)}`,
            );
        }
        return buffer;
    }

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > MAX_REMOTE_IMAGE_BYTES) {
            await reader.cancel();
            throw new Error(
                `Remote image exceeds the ${MAX_REMOTE_IMAGE_BYTES}-byte limit: ${safeUrl(url)}`,
            );
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}
