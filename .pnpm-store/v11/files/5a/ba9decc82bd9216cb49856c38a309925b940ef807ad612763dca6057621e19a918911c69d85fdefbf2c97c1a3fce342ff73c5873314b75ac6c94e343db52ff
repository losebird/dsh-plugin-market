import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeProjectSlug } from '../recoverPaste/adapters/claude.ts';
import { piSessionSlug } from '../recoverPaste/adapters/pi.ts';
import {
    codexTranscriptBelongsTo,
    lastAssistantModelFromLines,
    lastCodexModelFromLines,
    opencodeModelForCwd,
    sniffClaudeModel,
    sniffCodexModel,
    sniffPiModel,
} from './modelSniff.ts';

// The suite itself runs inside a real harness; keep detection out of the way.
beforeEach(() => {
    process.env.MODLENS_HARNESS = 'none';
});
afterEach(() => {
    delete process.env.MODLENS_HARNESS;
});

// Fixture cwds are real temp paths and slug directories come from the same
// slug functions the sniffers use, so the suite holds on Windows paths too
// (a hardcoded '/tmp/proj' slug never matches C:\tmp\proj).
function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-guard-'));
}

// claudeProjectSlug only rewrites '/' and '.', so on Windows a resolved cwd
// keeps its '\' and ':' and the resulting directory name is not even legal
// NTFS. Claude Code's real Windows layout is unverified territory recover-paste
// already skips there (see 3.1.0), and the sniffer fails open on it.
const onWindows = process.platform === 'win32';

describe('lastAssistantModelFromLines', () => {
    it('returns the newest assistant model, skipping user lines and malformed JSON', () => {
        const lines = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: [] } }),
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', model: 'old-model' },
            }),
            'not json at all {{{',
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', model: 'claude-fable-5' },
            }),
            JSON.stringify({ type: 'user', message: { role: 'user', content: [] } }),
        ];
        expect(lastAssistantModelFromLines(lines)).toEqual({ model: 'claude-fable-5' });
    });

    it('carries the provider when the transcript records one (pi shape)', () => {
        const lines = [
            JSON.stringify({
                message: { role: 'assistant', model: 'deepseek-v4-flash', provider: 'deepseek' },
            }),
        ];
        expect(lastAssistantModelFromLines(lines)).toEqual({
            model: 'deepseek-v4-flash',
            provider: 'deepseek',
        });
    });

    it('returns null when no assistant line carries a model', () => {
        const lines = [JSON.stringify({ message: { role: 'user', content: [] } }), ''];
        expect(lastAssistantModelFromLines(lines)).toBeNull();
    });
});

describe('codex rollout parsing', () => {
    const rollout = (cwd: string, models: string[]) => [
        JSON.stringify({ type: 'session_meta', payload: { cwd, id: 'thread-1' } }),
        ...models.map((model) => JSON.stringify({ type: 'turn_context', payload: { cwd, model } })),
    ];

    it('reads the newest turn_context model', () => {
        const lines = rollout('/repo', ['gpt-5.6-sol', 'gpt-5.6-luna']);
        expect(lastCodexModelFromLines(lines)).toBe('gpt-5.6-luna');
    });

    it('matches cwd in both directions (session at repo root, guard in a subdirectory)', () => {
        const lines = rollout('/repo', ['gpt-5.6-sol']);
        expect(codexTranscriptBelongsTo(lines, '/repo')).toBe(true);
        expect(codexTranscriptBelongsTo(lines, path.join('/repo', 'sub'))).toBe(true);
        expect(codexTranscriptBelongsTo(rollout('/repo/sub', ['m']), '/repo')).toBe(true);
        expect(codexTranscriptBelongsTo(lines, '/elsewhere')).toBe(false);
    });
});

describe.skipIf(onWindows)('sniffClaudeModel', () => {
    function writeSession(dir: string, name: string, cwd: string, model: string, mtime?: Date) {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        const lines = [
            JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: [] } }),
            JSON.stringify({ type: 'assistant', message: { role: 'assistant', model } }),
        ];
        fs.writeFileSync(file, lines.join('\n'));
        if (mtime) {
            fs.utimesSync(file, mtime, mtime);
        }
        return file;
    }

    it('pins the exact session via CLAUDE_CODE_SESSION_ID', () => {
        const projects = tempDir();
        const cwd = tempDir();
        const dir = path.join(projects, claudeProjectSlug(cwd));
        writeSession(dir, 'aaa.jsonl', cwd, 'wrong-model');
        writeSession(dir, 'bbb.jsonl', cwd, 'claude-fable-5');
        const found = sniffClaudeModel(cwd, { CLAUDE_CODE_SESSION_ID: 'bbb' }, projects);
        expect(found).toEqual({ model: 'claude-fable-5' });
    });

    it('falls back to the newest transcript that belongs to the cwd', () => {
        const projects = tempDir();
        const cwd = tempDir();
        const dir = path.join(projects, claudeProjectSlug(cwd));
        writeSession(dir, 'old.jsonl', cwd, 'old-model', new Date('2026-01-01'));
        writeSession(dir, 'new.jsonl', cwd, 'new-model', new Date('2026-08-01'));
        // Same directory, different real cwd: must be ignored despite being newest.
        writeSession(dir, 'alien.jsonl', `${cwd}-other`, 'alien-model', new Date('2026-08-10'));
        expect(sniffClaudeModel(cwd, {}, projects)).toEqual({ model: 'new-model' });
    });

    it('returns null when the project directory does not exist', () => {
        expect(sniffClaudeModel(tempDir(), {}, path.join(tempDir(), 'missing'))).toBeNull();
    });

    it('falls back to the scan when the pinned session has no assistant turn yet', () => {
        const projects = tempDir();
        const cwd = tempDir();
        const dir = path.join(projects, claudeProjectSlug(cwd));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'fresh.jsonl'),
            JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: [] } }),
        );
        writeSession(dir, 'older.jsonl', cwd, 'claude-fable-5', new Date('2026-08-01'));
        expect(sniffClaudeModel(cwd, { CLAUDE_CODE_SESSION_ID: 'fresh' }, projects)).toEqual({
            model: 'claude-fable-5',
        });
    });

    it('walks up to the session root slug when run in a subdirectory', () => {
        const projects = tempDir();
        const cwd = tempDir();
        writeSession(path.join(projects, claudeProjectSlug(cwd)), 's.jsonl', cwd, 'claude-fable-5');
        expect(sniffClaudeModel(path.join(cwd, 'packages', 'app'), {}, projects)).toEqual({
            model: 'claude-fable-5',
        });
    });

    it('prefers the pinned session in an ancestor slug over a scan hit in a deeper one', () => {
        const projects = tempDir();
        const cwd = tempDir();
        const sub = path.join(cwd, 'sub');
        // Old session filed under the subdirectory's own slug, the live pinned
        // session under the repo root's slug: the pin must win.
        writeSession(
            path.join(projects, claudeProjectSlug(sub)),
            'stale.jsonl',
            sub,
            'stale-vision-model',
        );
        writeSession(
            path.join(projects, claudeProjectSlug(cwd)),
            'live.jsonl',
            cwd,
            'claude-fable-5',
        );
        expect(sniffClaudeModel(sub, { CLAUDE_CODE_SESSION_ID: 'live' }, projects)).toEqual({
            model: 'claude-fable-5',
        });
    });

    it('reads only a bounded tail window of a huge transcript', () => {
        const projects = tempDir();
        const cwd = tempDir();
        const dir = path.join(projects, claudeProjectSlug(cwd));
        fs.mkdirSync(dir, { recursive: true });
        const filler = JSON.stringify({
            type: 'user',
            cwd,
            message: { role: 'user', content: ['x'.repeat(4096)] },
        });
        const lines = Array.from({ length: 300 }, () => filler);
        lines.push(
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', model: 'claude-fable-5' },
            }),
        );
        fs.writeFileSync(path.join(dir, 'big.jsonl'), lines.join('\n'));
        expect(sniffClaudeModel(cwd, {}, projects)).toEqual({ model: 'claude-fable-5' });
    });
});

describe('sniffPiModel', () => {
    it('rejects a huge transcript whose only cwd record sits at the head and mismatches', () => {
        // Pi records cwd once, in the session header. Lossy slugs collide
        // (/tmp/a-b and /tmp/a/b), so a tail-only read that misses the header
        // must not fall back to trusting the slug.
        const root = tempDir();
        const cwd = tempDir();
        const alienCwd = tempDir();
        const dir = path.join(root, piSessionSlug(cwd));
        fs.mkdirSync(dir, { recursive: true });
        const filler = JSON.stringify({ message: { role: 'user', content: ['x'.repeat(4096)] } });
        const lines = [
            JSON.stringify({ type: 'session', cwd: alienCwd }),
            ...Array.from({ length: 300 }, () => filler),
            JSON.stringify({ message: { role: 'assistant', model: 'alien-vision' } }),
        ];
        fs.writeFileSync(path.join(dir, 'big.jsonl'), lines.join('\n'));
        expect(sniffPiModel(cwd, root)).toBeNull();
    });

    it('reads the newest session in the cwd-slug directory', () => {
        const root = tempDir();
        const cwd = tempDir();
        const dir = path.join(root, piSessionSlug(cwd));
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, '2026-08-01T00-00-00-000Z_abc.jsonl');
        fs.writeFileSync(
            file,
            JSON.stringify({
                cwd,
                message: { role: 'assistant', model: 'deepseek-v4-flash', provider: 'deepseek' },
            }),
        );
        expect(sniffPiModel(cwd, root)).toEqual({
            model: 'deepseek-v4-flash',
            provider: 'deepseek',
        });
    });
});

describe('sniffCodexModel', () => {
    function writeRollout(root: string, day: string, name: string, cwd: string, model: string) {
        const dir = path.join(root, ...day.split('/'));
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        fs.writeFileSync(
            file,
            [
                JSON.stringify({ type: 'session_meta', payload: { cwd, id: 'x' } }),
                JSON.stringify({ type: 'turn_context', payload: { cwd, model } }),
            ].join('\n'),
        );
        return file;
    }

    it('pins the rollout file matching CODEX_THREAD_ID', () => {
        const root = tempDir();
        writeRollout(
            root,
            '2026/08/11',
            'rollout-2026-08-11T17-34-07-thread-a.jsonl',
            '/repo',
            'wrong',
        );
        writeRollout(
            root,
            '2026/08/12',
            'rollout-2026-08-12T09-00-00-thread-b.jsonl',
            '/repo',
            'gpt-5.6-sol',
        );
        expect(sniffCodexModel('/repo', { CODEX_THREAD_ID: 'thread-b' }, root)).toBe('gpt-5.6-sol');
    });

    it('ranks by write time, not creation time: a resumed old session beats an idle newer one', () => {
        const root = tempDir();
        const resumed = writeRollout(
            root,
            '2026/08/01',
            'rollout-a-old.jsonl',
            '/repo',
            'resumed-text',
        );
        const idle = writeRollout(
            root,
            '2026/08/11',
            'rollout-b-new.jsonl',
            '/repo',
            'idle-vision',
        );
        fs.utimesSync(resumed, new Date('2026-08-12'), new Date('2026-08-12'));
        fs.utimesSync(idle, new Date('2026-08-11'), new Date('2026-08-11'));
        expect(sniffCodexModel('/repo', {}, root)).toBe('resumed-text');
    });

    it('falls back to the newest rollout whose cwd matches', () => {
        const root = tempDir();
        const other = writeRollout(
            root,
            '2026/08/12',
            'rollout-x-other.jsonl',
            '/elsewhere',
            'nope',
        );
        const mine = writeRollout(
            root,
            '2026/08/11',
            'rollout-x-mine.jsonl',
            '/repo',
            'gpt-5.6-sol',
        );
        fs.utimesSync(other, new Date('2026-08-12'), new Date('2026-08-12'));
        fs.utimesSync(mine, new Date('2026-08-11'), new Date('2026-08-11'));
        expect(sniffCodexModel('/repo', {}, root)).toBe('gpt-5.6-sol');
        expect(sniffCodexModel('/nowhere', {}, root)).toBeNull();
    });
});

// node:sqlite ships unflagged on Node 22.13+; skip the DB-backed test elsewhere.
let DatabaseSync:
    | (new (
          p: string,
      ) => {
          exec: (sql: string) => void;
          prepare: (sql: string) => { run: (...params: unknown[]) => void };
          close: () => void;
      })
    | undefined;
try {
    ({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite'));
} catch {
    DatabaseSync = undefined;
}

describe.skipIf(!DatabaseSync)('opencodeModelForCwd', () => {
    it('returns the newest assistant model scoped to the session directory', () => {
        const Db = DatabaseSync as NonNullable<typeof DatabaseSync>;
        const cwd = tempDir();
        const dbPath = path.join(tempDir(), 'opencode.db');
        const db = new Db(dbPath);
        db.exec(`
            CREATE TABLE session (id TEXT PRIMARY KEY, slug TEXT, directory TEXT);
            CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
        `);
        const insertSession = db.prepare('INSERT INTO session VALUES (?, ?, ?)');
        // opencode records directories with forward slashes on every platform.
        insertSession.run('ses_mine', 's1', path.resolve(cwd).replace(/\\/g, '/'));
        insertSession.run('ses_other', 's2', '/elsewhere');
        const insertMessage = db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)');
        insertMessage.run(
            'm1',
            'ses_mine',
            1_000,
            JSON.stringify({ role: 'assistant', modelID: 'old-model', providerID: 'deepseek' }),
        );
        insertMessage.run(
            'm2',
            'ses_mine',
            2_000,
            JSON.stringify({
                role: 'assistant',
                modelID: 'deepseek-v4-flash',
                providerID: 'deepseek',
            }),
        );
        insertMessage.run('m3', 'ses_mine', 3_000, JSON.stringify({ role: 'user' }));
        insertMessage.run(
            'm4',
            'ses_other',
            9_000,
            JSON.stringify({ role: 'assistant', modelID: 'alien-vision', providerID: 'openai' }),
        );
        db.close();
        expect(opencodeModelForCwd(cwd, dbPath)).toEqual({
            model: 'deepseek-v4-flash',
            provider: 'deepseek',
        });
        expect(opencodeModelForCwd('/nowhere', dbPath)).toBeNull();
    });
});
