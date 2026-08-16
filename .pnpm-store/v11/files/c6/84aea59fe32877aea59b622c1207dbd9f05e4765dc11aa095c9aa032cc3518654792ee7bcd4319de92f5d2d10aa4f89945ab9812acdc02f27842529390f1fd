// Recover pasted images from agent session storage.
//
// Every supported harness persists user messages, image bytes included, locally
// before any gateway-side stripping happens, and that store is what this module
// reads. (Newer Claude Code builds additionally cache pastes as real files under
// ~/.claude/image-cache/ and, from the cli entrypoint, inject the path into the
// conversation; when that path is alive the skill reads it directly and never
// gets here. The cache is cleaned after a while, the transcript copy is not, so
// this recovery stays the route that works everywhere.) Each harness stores
// messages differently, so a per-harness adapter (adapters/) knows where to look
// and how to read the bytes, this module orchestrates detection, scoping, and
// writing the files.
//
// Storage layouts are internal implementation details of those tools, so this
// can break without notice; callers should fall back to asking for a path.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claudeAdapter, claudeExtractLine } from './adapters/claude.ts';
import { opencodeAdapter, opencodeSourceFor } from './adapters/opencode.ts';
import { piAdapter, piExtractLine } from './adapters/pi.ts';
import { detectHarness } from './detect.ts';
import { jsonlSource } from './jsonl.ts';
import type {
    HarnessAdapter,
    ImageBlockRef,
    RecoveredImage,
    RecoverOptions,
    RecoverResult,
    SourceRef,
} from './types.ts';

export { claudeProjectSlug } from './adapters/claude.ts';
export { piSessionSlug } from './adapters/pi.ts';
export { harnessFromPsTable } from './detect.ts';
export type {
    ImageBlockRef,
    RecoveredImage,
    RecoverOptions,
    RecoverResult,
} from './types.ts';

/** Last-resort extension from the media type itself, e.g. image/heic -> heic. */
function extensionFromMediaType(mediaType: string): string {
    const subtype = mediaType
        .split('/')[1]
        ?.split('+')[0]
        ?.replace(/[^a-z0-9]/gi, '');
    return subtype ? subtype.toLowerCase() : 'bin';
}

const EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

const ADAPTERS: HarnessAdapter[] = [claudeAdapter, piAdapter, opencodeAdapter];

/**
 * Resolve, and lock down, the directory recovered images land in.
 *
 * Pasted screenshots can hold anything, so the bytes must never be readable by
 * another local user. The default is a fresh per-call `mkdtemp` directory:
 * `mkdirSync -p` does not apply its mode to a directory that already exists, so
 * a fixed `tmpdir()/modlens-paste` let anyone on a shared box pre-create it
 * (0755, owned by them) and read every screenshot recovered into it. A unique
 * name nobody can predict closes that. We deliberately do not clean it up: the
 * recovered files are the product (downstream reads them via `modlens -i`), and
 * the system's own tmp reaper collects them later.
 *
 * An explicit `--out-dir` is the user's choice, so honour it, but still refuse
 * an unsafe one: created 0700 when absent, and when it already exists it must be
 * a real directory (not a symlink), owned by us, with no group/other bits.
 */
function prepareOutDir(explicit?: string): string {
    if (!explicit) {
        // mkdtemp creates the directory 0700 and owned by us in one step.
        return fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-paste-'));
    }

    const outDir = path.resolve(explicit);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
        try {
            // mkdir's mode is masked by umask, so pin it down afterwards.
            fs.chmodSync(outDir, 0o700);
        } catch {
            // best effort on platforms without chmod
        }
        return outDir;
    }

    // lstat, not stat: a symlink here could redirect the bytes somewhere world
    // readable, which is exactly what we are guarding against.
    const stat = fs.lstatSync(outDir);
    if (stat.isSymbolicLink()) {
        throw new Error(
            `--out-dir is a symlink, refusing to use it: ${outDir}. A symlink could redirect recovered screenshots somewhere readable by others.`,
        );
    }
    if (!stat.isDirectory()) {
        throw new Error(`--out-dir exists but is not a directory: ${outDir}.`);
    }
    // POSIX ownership and permission bits only mean something where the platform
    // enforces them. On Windows process.getuid is undefined and directories report
    // mode 0o777, so the ownership and group/world checks would reject every
    // existing --out-dir. Skip them there and rely on the symlink and
    // is-a-directory guards above; access control on Windows is ACL-based, outside
    // what modlens can assert from a stat.
    const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (uid !== undefined) {
        if (stat.uid !== uid) {
            throw new Error(
                `--out-dir is owned by another user (uid ${stat.uid}, not ${uid}): ${outDir}. On a shared machine that user could read the recovered images.`,
            );
        }
        if (stat.mode & 0o077) {
            throw new Error(
                `--out-dir is group- or world-accessible (mode ${(stat.mode & 0o777).toString(8)}): ${outDir}. Recovered screenshots can hold anything; use a private directory (chmod 700).`,
            );
        }
    }
    return outDir;
}

function sourceForExplicitPath(filePath: string, cwd: string, harness?: string): SourceRef {
    // An explicit --harness is the user telling us the format. Honour it: a
    // copied transcript has no telltale path, and guessing read it as Claude.
    const declared = harness && harness !== 'none' ? harness : undefined;
    if (declared === 'opencode' || (!declared && filePath.endsWith('.db'))) {
        return opencodeSourceFor(filePath, cwd);
    }
    if (declared === 'pi' || (!declared && filePath.includes(`${path.sep}.pi${path.sep}`))) {
        return jsonlSource('pi', filePath, piExtractLine);
    }
    return jsonlSource('claude-code', filePath, claudeExtractLine);
}

export function locateSource(cwd: string, adapters: HarnessAdapter[] = ADAPTERS): SourceRef {
    let best: { ref: SourceRef; timestamp: number } | null = null;
    const blockers: string[] = [];
    for (const adapter of adapters) {
        let candidate: { ref: SourceRef; timestamp: number } | null = null;
        try {
            candidate = adapter.findNewest(cwd);
        } catch (error) {
            // An unreadable store should not block the other harnesses, but a
            // setup problem the user can fix (Node too old for node:sqlite)
            // must not vanish into a bare "no images found".
            blockers.push(
                `${adapter.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if (candidate && (!best || candidate.timestamp > best.timestamp)) {
            best = candidate;
        }
    }
    if (!best) {
        const dirs = adapters.map((a) => a.describe(cwd)).join(' , ');
        const blocked = blockers.length > 0 ? `\nBlocked: ${blockers.join(' | ')}` : '';
        throw new Error(
            `No pasted images found in any session storage for this directory (looked in: ${dirs}). The user may not have pasted any, the storage format changed, or a legacy transcript records no cwd (ownership cannot be proven; an explicit --transcript path bypasses that check). Ask for a file path instead.${blocked}`,
        );
    }
    return best.ref;
}

export function sourceForSession(
    cwd: string,
    sessionId: string,
    adapters: HarnessAdapter[] = ADAPTERS,
): SourceRef {
    const blockers: string[] = [];
    for (const adapter of adapters) {
        try {
            const ref = adapter.findSession(cwd, sessionId);
            if (ref) {
                return ref;
            }
        } catch (error) {
            blockers.push(
                `${adapter.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
    const dirs = adapters.map((a) => a.describe(cwd)).join(' , ');
    const blocked = blockers.length > 0 ? `\nBlocked: ${blockers.join(' | ')}` : '';
    throw new Error(
        `No session ${sessionId} with pasted images under this project (looked in: ${dirs}). Check --cwd, or drop --session to auto-locate by newest pasted image.${blocked}`,
    );
}

export function recoverPastedImages(options: RecoverOptions = {}): RecoverResult {
    const cwd = options.cwd ?? process.cwd();

    const detected = options.transcript ? null : (options.harness ?? detectHarness());
    if (detected === 'codex') {
        throw new Error(
            'This is a Codex session: pasted images already exist as temp files, and each image tag in the message carries its path. Read the path from the tag instead of running recover-paste.',
        );
    }
    // Validate the requested harness even when --transcript short-circuits
    // detection, or a typo silently parsed the file as Claude Code.
    const requested = options.harness?.trim();
    if (requested && requested !== 'none' && !ADAPTERS.some((a) => a.name === requested)) {
        throw new Error(
            `Unknown harness "${requested}". Supported: ${ADAPTERS.map((a) => a.name).join(', ')} (or none to scan all).`,
        );
    }

    const scoped: string | null = detected && detected !== 'none' ? detected : null;
    if (scoped && !ADAPTERS.some((adapter) => adapter.name === scoped)) {
        throw new Error(
            `Unknown harness "${scoped}". Supported: claude-code, pi, opencode (or none to scan all).`,
        );
    }
    const adapters = scoped ? ADAPTERS.filter((adapter) => adapter.name === scoped) : ADAPTERS;

    // Claude Code injects the session id into tool environments, which lets us
    // target the exact transcript without the skill relaying anything. It can
    // point at an imageless transcript (e.g. a subagent session), so fall back
    // to scanning instead of failing when it does not pan out.
    let source: SourceRef | null = null;
    if (options.transcript) {
        source = sourceForExplicitPath(options.transcript, cwd, options.harness);
    } else if (options.session) {
        source = sourceForSession(cwd, options.session, adapters);
    } else {
        const envSession =
            detected === 'claude-code' ? process.env.CLAUDE_CODE_SESSION_ID : undefined;
        if (envSession) {
            try {
                source = sourceForSession(cwd, envSession, adapters);
            } catch {
                source = null;
            }
        }
        source ??= locateSource(cwd, adapters);
    }
    // Clamped to 20: recovery copies user images into the temp dir, and an
    // unbounded --count would let one call replicate a whole session history.
    const count = Math.min(Math.max(1, options.count ?? 1), 20);

    const all = source.extract();
    if (all.length === 0) {
        throw new Error(
            `No pasted images found in ${source.location}. The user may not have pasted any, the storage format changed, or a legacy transcript records no cwd (ownership cannot be proven; an explicit --transcript path bypasses that check). Ask for a file path instead.`,
        );
    }

    const outDir = prepareOutDir(options.outDir);
    const picked = all.slice(-count);
    const images: RecoveredImage[] = picked.map((image) => {
        const buffer = Buffer.from(image.data, 'base64');
        const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
        // An unmapped image/* used to be relabelled .png, and downstream tools
        // trust the extension, so they were handed the wrong type.
        const ext = EXT_BY_MIME[image.mediaType] ?? extensionFromMediaType(image.mediaType);
        const filePath = path.join(outDir, `paste-${hash}.${ext}`);
        fs.writeFileSync(filePath, buffer, { mode: 0o600 });
        try {
            // writeFileSync only applies mode when creating, and these names are
            // content hashes, so a file recovered before this fix keeps 0644.
            fs.chmodSync(filePath, 0o600);
        } catch {
            // best effort on platforms without chmod
        }
        const recovered: RecoveredImage = {
            path: filePath,
            mediaType: image.mediaType,
            bytes: buffer.length,
        };
        if (image.filename) {
            recovered.filename = image.filename;
        }
        return recovered;
    });

    const result: RecoverResult = { harness: source.harness, transcript: source.location, images };
    if (scoped) {
        result.detected = scoped;
    }
    return result;
}

/**
 * JSONL extraction for one transcript path, no scoping or scanning.
 *
 * @internal Exported only so tests can exercise extraction in isolation. The
 * real entry point is recoverPastedImages; do not depend on this elsewhere.
 */
export function extractUserImages(transcriptPath: string): ImageBlockRef[] {
    return sourceForExplicitPath(transcriptPath, process.cwd()).extract();
}
