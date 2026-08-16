import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recoverPastedImages } from '../index.ts';
import { buildOpencodeQuery, opencodeDirectoryFilter } from './opencode.ts';

const onWindows = process.platform === 'win32';

// The suite itself runs inside a real harness, so default every test to
// unscoped scanning.
beforeEach(() => {
    process.env.MODLENS_HARNESS = 'none';
});
afterEach(() => {
    delete process.env.MODLENS_HARNESS;
});

describe('opencodeDirectoryFilter case handling', () => {
    it('keeps POSIX comparisons case-sensitive and lowers both sides on Windows', () => {
        const posix = opencodeDirectoryFilter('/tmp/Proj', false);
        expect(posix.clause).not.toContain('LOWER');
        expect(posix.params[0]).toBe('/tmp/Proj');
        const win = opencodeDirectoryFilter('E:\\GitTest\\Proj', true);
        expect(win.clause).toContain('LOWER');
        expect(win.params[0]).toBe('e:/gittest/proj');
    });
});

// node:sqlite ships unflagged on Node 22.13+, so these DB-backed tests are
// skipped on older runtimes rather than crashing the suite. The recovery path
// itself degrades gracefully there: opencode surfaces as a "Blocked:" note while
// the JSONL harnesses keep working, which the index suite covers.
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

describe.skipIf(!DatabaseSync)('opencode Windows path normalization (issue #11)', () => {
    const Db = DatabaseSync as NonNullable<typeof DatabaseSync>;

    // A session directory as opencode stores it: forward slashes even on
    // Windows. path.resolve on Windows would hand back the backslash form, which
    // the query builder must normalize before matching.
    function dbWithSession(dir: string, partData: string) {
        const db = new Db(':memory:');
        db.exec(`
            CREATE TABLE session (id TEXT PRIMARY KEY, slug TEXT, directory TEXT);
            CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
            CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
        `);
        db.prepare('INSERT INTO session VALUES (?, ?, ?)').run('ses_1', 'slug-1', dir);
        db.prepare(`INSERT INTO message VALUES (?, ?, ?, '{"role":"user"}')`).run(
            'msg_1',
            'ses_1',
            1_000,
        );
        db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?)').run(
            'prt_1',
            'msg_1',
            'ses_1',
            1_000,
            partData,
        );
        return db;
    }

    function runQuery(db: InstanceType<typeof Db>, resolvedCwd: string): unknown[] {
        const { sql, params } = buildOpencodeQuery(resolvedCwd);
        return (db.prepare(sql) as unknown as { all: (...p: unknown[]) => unknown[] }).all(
            ...params,
        );
    }

    const filePart = '{"type":"file","mime":"image/png","url":"data:image/png;base64,AAAA"}';

    it('matches a forward-slash session directory from a backslash cwd', () => {
        const db = dbWithSession('E:/gitTest/proj', filePart);
        // path.resolve on Windows returns backslashes for this cwd.
        expect(runQuery(db, 'E:\\gitTest\\proj')).toHaveLength(1);
        db.close();
    });

    it('matches across the repo-root/subdirectory gap with backslash input', () => {
        // Session launched in a subdir, recovery run from the repo root: the
        // subdirectory LIKE branch must fire after normalization.
        const db = dbWithSession('E:/gitTest/proj/assets', filePart);
        expect(runQuery(db, 'E:\\gitTest\\proj')).toHaveLength(1);
        db.close();
    });

    it('does not match an unrelated project sharing a name prefix', () => {
        const db = dbWithSession('E:/gitTest/project-two', filePart);
        expect(runQuery(db, 'E:\\gitTest\\proj')).toHaveLength(0);
        db.close();
    });

    // The ancestor direction compares the stored directory against the cwd.
    // That stored value comes from the database, so it must never act as a
    // LIKE pattern: `_`/`%` inside another project's path would otherwise
    // match across projects.
    it('does not let _ in a stored directory wildcard-match another project', () => {
        const db = dbWithSession('/tmp/proj_1', filePart);
        expect(runQuery(db, '/tmp/projA1/sub')).toHaveLength(0);
        db.close();
    });

    it('does not let % in a stored directory wildcard-match another project', () => {
        const db = dbWithSession('/tmp/pro%t', filePart);
        expect(runQuery(db, '/tmp/proXt/sub')).toHaveLength(0);
        db.close();
    });

    it('still matches a genuine ancestor directory that contains _', () => {
        const db = dbWithSession('/tmp/proj_1', filePart);
        expect(runQuery(db, '/tmp/proj_1/sub')).toHaveLength(1);
        db.close();
    });

    function runCaseQuery(
        db: InstanceType<typeof Db>,
        resolvedCwd: string,
        caseInsensitive: boolean,
    ): unknown[] {
        const { clause, params } = opencodeDirectoryFilter(resolvedCwd, caseInsensitive);
        return (
            db.prepare(`SELECT session.id FROM session WHERE ${clause}`) as unknown as {
                all: (...p: unknown[]) => unknown[];
            }
        ).all(...params);
    }

    it('case-sensitive on POSIX: /tmp/Project is not /tmp/project', () => {
        // SQLite LIKE is ASCII case-insensitive, which the old query inherited;
        // SUBSTR equality respects case, matching case-sensitive filesystems.
        const db = dbWithSession('/tmp/Project', filePart);
        expect(runCaseQuery(db, '/tmp/project/sub', false)).toHaveLength(0);
        expect(runCaseQuery(db, '/tmp/Project/sub', false)).toHaveLength(1);
        db.close();
    });

    it('measures the prefix boundary in code points, not UTF-16 units', () => {
        // SQLite SUBSTR counts characters; JS .length counts UTF-16 units.
        // An emoji (2 units, 1 character) used to shift the boundary and
        // reject the genuine subdirectory.
        const db = dbWithSession('/tmp/😀proj', filePart);
        expect(runQuery(db, '/tmp/😀proj/sub')).toHaveLength(1);
        expect(runQuery(db, '/tmp/😀projX/sub')).toHaveLength(0);
        db.close();
    });

    it('treats filesystem roots as valid ancestors without doubling the slash', () => {
        const db = dbWithSession('/', filePart);
        // A stored root session claims everything under it.
        expect(runQuery(db, '/tmp/project')).toHaveLength(1);
        db.close();
        const winRoot = dbWithSession('E:/', filePart);
        expect(runCaseQuery(winRoot, 'e:\\project\\sub', true)).toHaveLength(1);
        winRoot.close();
        // And a cwd at the root accepts stored subdirectories.
        const sub = dbWithSession('/tmp/deep', filePart);
        expect(runQuery(sub, '/')).toHaveLength(1);
        sub.close();
    });

    it('case-insensitive on Windows: mixed-case ancestor still matches', () => {
        const db = dbWithSession('E:/GitTest/Proj', filePart);
        expect(runCaseQuery(db, 'e:\\gittest\\proj\\sub', true)).toHaveLength(1);
        // Wildcards still do not work in either mode.
        const wild = dbWithSession('E:/pro_j', filePart);
        expect(runCaseQuery(wild, 'e:\\proXj\\sub', true)).toHaveLength(0);
        wild.close();
        db.close();
    });
});

describe.skipIf(!DatabaseSync)('opencode harness support', { timeout: 30_000 }, () => {
    const Db = DatabaseSync as NonNullable<typeof DatabaseSync>;

    function openDb(home: string) {
        const dir = path.join(home, '.local', 'share', 'opencode');
        fs.mkdirSync(dir, { recursive: true });
        const db = new Db(path.join(dir, 'opencode.db'));
        db.exec(`
            CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, slug TEXT, directory TEXT);
            CREATE TABLE IF NOT EXISTS message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
            CREATE TABLE IF NOT EXISTS part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
        `);
        return db;
    }

    function insertImage(
        db: InstanceType<typeof Db>,
        n: number,
        slug: string,
        directory: string,
        timeMs: number,
        payload: string,
    ) {
        db.prepare('INSERT OR IGNORE INTO session VALUES (?, ?, ?)').run(
            `ses_${n}`,
            slug,
            directory,
        );
        db.prepare(`INSERT INTO message VALUES (?, ?, ?, '{"role":"user"}')`).run(
            `msg_${n}`,
            `ses_${n}`,
            timeMs,
        );
        db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?)').run(
            `prt_${n}`,
            `msg_${n}`,
            `ses_${n}`,
            timeMs,
            JSON.stringify({
                type: 'file',
                mime: 'image/png',
                filename: `f${n}.png`,
                url: `data:image/png;base64,${Buffer.from(payload).toString('base64')}`,
            }),
        );
    }

    function withHome<T>(home: string, run: () => T): T {
        const realHome = process.env.HOME;
        const realUserProfile = process.env.USERPROFILE;
        // os.homedir() reads HOME on POSIX and USERPROFILE on Windows; set both so
        // the opencode db lookup lands in the fake home on either platform.
        process.env.HOME = home;
        process.env.USERPROFILE = home;
        try {
            return run();
        } finally {
            restoreEnv('HOME', realHome);
            restoreEnv('USERPROFILE', realUserProfile);
            fs.rmSync(home, { recursive: true, force: true });
        }
    }

    function restoreEnv(key: string, value: string | undefined): void {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    function imageLine(data: string, timestamp: string, mediaType = 'image/png'): string {
        return JSON.stringify({
            timestamp,
            message: {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: Buffer.from(data).toString('base64'),
                        },
                    },
                ],
            },
        });
    }

    it('recovers file parts by directory and by session, reporting the original filename', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-oc-'));
        const cwd = '/tmp/proj';
        const db = openDb(home);
        insertImage(
            db,
            1,
            'my-session',
            path.resolve(cwd),
            Date.parse('2026-08-03T06:00:00.000Z'),
            'oc-image',
        );
        db.close();

        withHome(home, () => {
            const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
            expect(result.harness).toBe('opencode');
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('oc-image');
            expect(result.images[0].filename).toBe('f1.png');

            const bySlug = recoverPastedImages({
                cwd,
                session: 'my-session',
                outDir: path.join(home, 'out'),
            });
            expect(bySlug.harness).toBe('opencode');
        });
    });

    it('matches sessions across the repo-root/subdirectory gap in both directions', () => {
        // opencode records session.directory where it was launched, but runs
        // bash at the repo root; recovery must survive the mismatch.
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-oc-dir-'));
        const root = '/tmp/repo';
        const db = openDb(home);
        insertImage(
            db,
            1,
            's-sub',
            path.join(path.resolve(root), 'assets'),
            1_000,
            'launched-in-subdir',
        );
        db.close();

        withHome(home, () => {
            const fromRoot = recoverPastedImages({ cwd: root, outDir: path.join(home, 'out') });
            expect(fromRoot.harness).toBe('opencode');
            expect(fs.readFileSync(fromRoot.images[0].path).toString()).toBe('launched-in-subdir');

            const fromDeeper = recoverPastedImages({
                cwd: path.join(root, 'assets', 'icons'),
                outDir: path.join(home, 'out'),
            });
            expect(fs.readFileSync(fromDeeper.images[0].path).toString()).toBe(
                'launched-in-subdir',
            );
        });
    });

    it('scopes recovery to the single session owning the newest image', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-oc-scope-'));
        const cwd = '/tmp/proj';
        const db = openDb(home);
        insertImage(db, 1, 's-old', path.resolve(cwd), 1_000, 'old-session-image');
        insertImage(db, 2, 's-new', path.resolve(cwd), 2_000, 'new-session-image');
        db.close();

        withHome(home, () => {
            const result = recoverPastedImages({ cwd, count: 5, outDir: path.join(home, 'out') });
            expect(result.images).toHaveLength(1);
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('new-session-image');
        });
    });

    // Mixes an OpenCode db image with a Claude JSONL fixture. The Claude side keys
    // off the Claude project slug, which keeps the drive colon on Windows and so
    // cannot be located there; the cross-store ranking is exercised on POSIX. The
    // three tests above already prove OpenCode recovery end to end on Windows.
    it.skipIf(onWindows)('outranks older jsonl images when its part is newest', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-oc2-'));
        const cwd = '/tmp/proj';
        const claudeDir = path.join(home, '.claude', 'projects', '-tmp-proj');
        fs.mkdirSync(claudeDir, { recursive: true });
        fs.writeFileSync(
            path.join(claudeDir, 'c.jsonl'),
            imageLine('claude-older', '2026-08-03T01:00:00.000Z'),
        );
        const db = openDb(home);
        insertImage(
            db,
            1,
            's1',
            path.resolve(cwd),
            Date.parse('2026-08-03T09:00:00.000Z'),
            'oc-newer',
        );
        db.close();

        withHome(home, () => {
            const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
            expect(result.harness).toBe('opencode');
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('oc-newer');
        });
    });
});
