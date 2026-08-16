// Active-model sniffing: read which model the harness around us is actually
// running, from the same local session storage recover-paste already reads.
// Every harness writes the model name on its assistant turns, so the last
// assistant record is the ground truth that outranks a model's self-report
// (a model does not always know its own name, but its transcript does).
// All of this is best-effort over each harness's internals: any miss returns
// null and the guard fails open.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claudeProjectSlug } from '../recoverPaste/adapters/claude.ts';
import {
    loadNodeSqlite,
    opencodeDbPath,
    opencodeDirectoryFilter,
} from '../recoverPaste/adapters/opencode.ts';
import { piSessionSlug } from '../recoverPaste/adapters/pi.ts';
import { cwdMatches, listJsonlByMtimeDesc, transcriptBelongsTo } from '../recoverPaste/jsonl.ts';

export interface SniffedModel {
    model: string;
    provider?: string;
}

/**
 * Transcripts carry inline base64 images and can reach hundreds of MB, while
 * the sniff only needs two things: the newest assistant record (at the end)
 * and the cwd evidence, which Claude Code repeats on every record but Pi
 * writes once, in the session header. So read a bounded window from each end
 * instead of the whole file and scan the combined lines.
 */
const WINDOW_BYTES = 512 * 1024;

export function readWindowedLines(file: string, maxBytes = WINDOW_BYTES): string[] | null {
    let fd: number;
    try {
        fd = fs.openSync(file, 'r');
    } catch {
        return null;
    }
    try {
        const size = fs.fstatSync(fd).size;
        if (size <= 2 * maxBytes) {
            const whole = Buffer.alloc(size);
            fs.readSync(fd, whole, 0, size, 0);
            return whole.toString('utf-8').split('\n');
        }
        const head = Buffer.alloc(maxBytes);
        fs.readSync(fd, head, 0, maxBytes, 0);
        const tail = Buffer.alloc(maxBytes);
        fs.readSync(fd, tail, 0, maxBytes, size - maxBytes);
        // Window edges cut records in half: drop the partial last head line
        // and partial first tail line so the scanners never parse half a record.
        const headLines = head.toString('utf-8').split('\n');
        headLines.pop();
        const tailLines = tail.toString('utf-8').split('\n');
        tailLines.shift();
        return [...headLines, ...tailLines];
    } catch {
        return null;
    } finally {
        fs.closeSync(fd);
    }
}

/** Newest assistant `message.model` in a JSONL transcript (Claude Code and Pi shape). */
export function lastAssistantModelFromLines(lines: string[]): SniffedModel | null {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes('"model"')) {
            continue;
        }
        try {
            const message = (
                JSON.parse(line) as {
                    message?: { role?: string; model?: unknown; provider?: unknown };
                }
            ).message;
            if (message?.role === 'assistant' && typeof message.model === 'string') {
                const found: SniffedModel = { model: message.model };
                if (typeof message.provider === 'string') {
                    found.provider = message.provider;
                }
                return found;
            }
        } catch {
            // skip malformed lines
        }
    }
    return null;
}

/** Newest `turn_context.payload.model` in a Codex rollout file. */
export function lastCodexModelFromLines(lines: string[]): string | null {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes('"turn_context"')) {
            continue;
        }
        try {
            const parsed = JSON.parse(line) as { type?: string; payload?: { model?: unknown } };
            if (parsed.type === 'turn_context' && typeof parsed.payload?.model === 'string') {
                return parsed.payload.model;
            }
        } catch {
            // skip malformed lines
        }
    }
    return null;
}

/**
 * Codex records the session cwd inside payloads, not at the top level, so the
 * shared transcriptBelongsTo cannot judge it. Matching runs in both directions
 * because the session may sit at the repo root while the guard runs in a
 * subdirectory, or the other way around.
 */
export function codexTranscriptBelongsTo(lines: string[], cwd: string): boolean {
    for (const line of lines) {
        if (!line.includes('"cwd"')) {
            continue;
        }
        try {
            const recorded = (JSON.parse(line) as { payload?: { cwd?: unknown } }).payload?.cwd;
            if (typeof recorded === 'string' && cwdMatches(recorded, cwd, true)) {
                return true;
            }
        } catch {
            // keep looking
        }
    }
    return false;
}

/** The cwd and each of its parents, for storage keyed by a session-root slug. */
function* cwdAncestors(cwd: string): Generator<string> {
    let current = path.resolve(cwd);
    for (;;) {
        yield current;
        const parent = path.dirname(current);
        if (parent === current) {
            return;
        }
        current = parent;
    }
}

/** Shared scan for the JSONL harnesses: newest transcript for this cwd wins. */
function newestAssistantModelInDir(dir: string, cwd: string): SniffedModel | null {
    for (const file of listJsonlByMtimeDesc(dir)) {
        const lines = readWindowedLines(file);
        // Bidirectional: the session may own an ancestor of the guard's cwd.
        if (!lines || !transcriptBelongsTo(lines, cwd, true)) {
            continue;
        }
        const found = lastAssistantModelFromLines(lines);
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * A session launched at the repo root files its transcripts under the root's
 * slug, so a guard run in a subdirectory must walk up to find them.
 */
function existingSlugDirs(root: string, cwd: string, slugFor: (dir: string) => string): string[] {
    const dirs: string[] = [];
    for (const ancestor of cwdAncestors(cwd)) {
        const dir = path.join(root, slugFor(ancestor));
        if (fs.existsSync(dir)) {
            dirs.push(dir);
        }
    }
    return dirs;
}

export function sniffClaudeModel(
    cwd: string,
    env: NodeJS.ProcessEnv,
    projectsDir = path.join(os.homedir(), '.claude', 'projects'),
): SniffedModel | null {
    const dirs = existingSlugDirs(projectsDir, cwd, claudeProjectSlug);
    // The pinned session is the strongest evidence, so exhaust every candidate
    // directory for it before any unpinned scan: a scan hit in a deeper slug
    // must not shadow the exact session sitting under an ancestor's slug.
    const sessionId = env.CLAUDE_CODE_SESSION_ID?.trim();
    if (sessionId) {
        for (const dir of dirs) {
            const lines = readWindowedLines(path.join(dir, `${sessionId}.jsonl`));
            const pinned = lines ? lastAssistantModelFromLines(lines) : null;
            if (pinned) {
                return pinned;
            }
            // A pinned transcript with no assistant turn yet falls through to
            // the scan rather than reporting unknown.
        }
    }
    for (const dir of dirs) {
        const found = newestAssistantModelInDir(dir, cwd);
        if (found) {
            return found;
        }
    }
    return null;
}

export function sniffPiModel(
    cwd: string,
    sessionsRoot = path.join(os.homedir(), '.pi', 'agent', 'sessions'),
): SniffedModel | null {
    for (const dir of existingSlugDirs(sessionsRoot, cwd, piSessionSlug)) {
        const found = newestAssistantModelInDir(dir, cwd);
        if (found) {
            return found;
        }
    }
    return null;
}

/** Rollouts of every project share one tree; read the newest few only. */
const CODEX_SCAN_LIMIT = 20;
/** How many recent-by-name files get a stat for the mtime ranking below. */
const CODEX_STAT_LIMIT = 200;

export function sniffCodexModel(
    cwd: string,
    env: NodeJS.ProcessEnv,
    sessionsRoot = path.join(os.homedir(), '.codex', 'sessions'),
): string | null {
    // Rollouts live at yyyy/mm/dd/rollout-<timestamp>-<uuid>.jsonl, so the
    // relative path sorts by creation time with no stat calls. That is enough
    // for the thread-id pin, but not for picking "the live session": a resumed
    // session keeps its old name while its mtime moves. So rank a bounded
    // recent-by-name slice by mtime instead of statting years of files.
    let names: string[];
    try {
        names = (fs.readdirSync(sessionsRoot, { recursive: true }) as string[])
            .filter((name) => name.endsWith('.jsonl'))
            .sort()
            .reverse();
    } catch {
        return null;
    }
    const threadId = env.CODEX_THREAD_ID?.trim();
    if (threadId) {
        const pinned = names.find((name) => path.basename(name).endsWith(`-${threadId}.jsonl`));
        if (pinned) {
            const lines = readWindowedLines(path.join(sessionsRoot, pinned));
            const model = lines ? lastCodexModelFromLines(lines) : null;
            if (model) {
                return model;
            }
        }
    }
    const byMtimeDesc = names
        .slice(0, CODEX_STAT_LIMIT)
        .map((name) => {
            const file = path.join(sessionsRoot, name);
            try {
                return { file, mtime: fs.statSync(file).mtimeMs };
            } catch {
                return null;
            }
        })
        .filter((entry): entry is { file: string; mtime: number } => entry !== null)
        .sort((a, b) => b.mtime - a.mtime);
    for (const entry of byMtimeDesc.slice(0, CODEX_SCAN_LIMIT)) {
        const lines = readWindowedLines(entry.file);
        if (!lines || !codexTranscriptBelongsTo(lines, cwd)) {
            continue;
        }
        const model = lastCodexModelFromLines(lines);
        if (model) {
            return model;
        }
    }
    return null;
}

export function opencodeModelForCwd(cwd: string, dbPath = opencodeDbPath()): SniffedModel | null {
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    const DatabaseSync = loadNodeSqlite();
    if (!DatabaseSync) {
        return null; // no node:sqlite on this runtime: fail open
    }

    // Same directory scoping as paste recovery. No session pinning exists for
    // opencode (it injects no session env), so concurrent sessions in the same
    // project can shadow each other; MODLENS_MODEL is the documented override.
    const directory = opencodeDirectoryFilter(path.resolve(cwd));
    const sql = `SELECT message.data AS data
                 FROM message
                 JOIN session ON session.id = message.session_id
                 WHERE json_extract(message.data, '$.role') = 'assistant'
                   AND ${directory.clause}
                 ORDER BY message.time_created DESC
                 LIMIT 1`;
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
        const rows = db.prepare(sql).all(...directory.params) as Array<{ data: string }>;
        if (rows.length === 0) {
            return null;
        }
        const data = JSON.parse(rows[0].data) as { modelID?: unknown; providerID?: unknown };
        if (typeof data.modelID !== 'string') {
            return null;
        }
        const found: SniffedModel = { model: data.modelID };
        if (typeof data.providerID === 'string') {
            found.provider = data.providerID;
        }
        return found;
    } catch {
        return null; // storage is opencode's internals: any surprise fails open
    } finally {
        db.close();
    }
}

/** Roots injectable for tests; defaults point at the real per-harness storage. */
export interface SniffRoots {
    claudeProjectsDir?: string;
    piSessionsRoot?: string;
    codexSessionsRoot?: string;
    opencodeDb?: string;
}

export function sniffModel(
    harness: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    roots: SniffRoots = {},
): SniffedModel | null {
    try {
        switch (harness) {
            case 'claude-code':
                return sniffClaudeModel(cwd, env, roots.claudeProjectsDir);
            case 'pi':
                return sniffPiModel(cwd, roots.piSessionsRoot);
            case 'codex': {
                const model = sniffCodexModel(cwd, env, roots.codexSessionsRoot);
                return model ? { model } : null;
            }
            case 'opencode':
                return opencodeModelForCwd(cwd, roots.opencodeDb);
            default:
                return null;
        }
    } catch {
        return null; // best-effort: a sniffing surprise must never block a read
    }
}
