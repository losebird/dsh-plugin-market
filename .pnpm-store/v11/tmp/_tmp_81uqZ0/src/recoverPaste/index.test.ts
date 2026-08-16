import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    claudeProjectSlug,
    extractUserImages,
    piSessionSlug,
    recoverPastedImages,
} from './index.ts';

// Recovery from JSONL stores keys off os.homedir() and the harness slug
// conventions (Claude Code, Pi), both of which are POSIX-shaped here: HOME points
// at a temp home, cwds are POSIX paths, and the slugs derive from them. On Windows
// os.homedir() reads USERPROFILE and the Claude slug keeps the drive colon, so
// these fixtures cannot stand in for a real Windows layout; the suites that depend
// on them are scoped to POSIX. The OpenCode path, the one issue #11 fixed, is
// verified on Windows in adapters/opencode.test.ts, and the transcript-based and
// Codex-guard tests below stay cross-platform.
const onWindows = process.platform === 'win32';

// The suite itself runs inside a real harness (its process ancestry and env
// would trip detection), so default every test to unscoped scanning and let
// detection tests opt in explicitly.
const REAL_SESSION_ENV = process.env.CLAUDE_CODE_SESSION_ID;
beforeEach(() => {
    process.env.MODLENS_HARNESS = 'none';
    delete process.env.CLAUDE_CODE_SESSION_ID;
});
afterEach(() => {
    delete process.env.MODLENS_HARNESS;
    if (REAL_SESSION_ENV === undefined) {
        delete process.env.CLAUDE_CODE_SESSION_ID;
    } else {
        process.env.CLAUDE_CODE_SESSION_ID = REAL_SESSION_ENV;
    }
});

// Real Claude Code transcript lines carry a top-level cwd; ownership checks
// fail closed without one, so fixtures default to the common test cwd. Pass
// null to fabricate a legacy cwd-less line on purpose.
function imageLine(
    data: string,
    timestamp: string,
    mediaType = 'image/png',
    cwd: string | null = '/tmp/proj',
): string {
    return JSON.stringify({
        timestamp,
        ...(cwd === null ? {} : { cwd }),
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

function piImageLine(
    data: string,
    timestamp: string,
    mimeType = 'image/png',
    cwd: string | null = '/tmp/proj',
): string {
    return JSON.stringify({
        type: 'message',
        id: 'x',
        parentId: null,
        timestamp,
        ...(cwd === null ? {} : { cwd }),
        message: {
            role: 'user',
            content: [{ type: 'image', data: Buffer.from(data).toString('base64'), mimeType }],
            timestamp: Date.parse(timestamp),
        },
    });
}

describe.skipIf(onWindows)('slug encoding', () => {
    it('derives claude project slugs (slashes and dots become dashes)', () => {
        expect(claudeProjectSlug('/Users/dev/projects/liustack-web')).toBe(
            '-Users-dev-projects-liustack-web',
        );
        expect(claudeProjectSlug('/Users/dev/.claude')).toBe('-Users-dev--claude');
    });

    it('derives pi session slugs (leading slash stripped, wrapped in double dashes)', () => {
        expect(piSessionSlug('/tmp/proj')).toBe('--tmp-proj--');
        expect(piSessionSlug('/Users/dev/my-app')).toBe('--Users-dev-my-app--');
    });
});

describe('extractUserImages + recoverPastedImages', () => {
    it('extracts user image blocks in order, skipping assistant images and junk lines', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-rec-'));
        const transcript = path.join(dir, 's1.jsonl');
        const lines = [
            JSON.stringify({ message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
            imageLine('first-image', '2026-08-03T01:00:00.000Z'),
            'not json at all',
            JSON.stringify({
                message: {
                    role: 'assistant',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: Buffer.from('assistant-image').toString('base64'),
                            },
                        },
                    ],
                },
            }),
            imageLine('second-image', '2026-08-03T02:00:00.000Z', 'image/jpeg'),
        ];
        fs.writeFileSync(transcript, lines.join('\n'));

        expect(extractUserImages(transcript)).toHaveLength(2);

        const outDir = path.join(dir, 'out');
        const result = recoverPastedImages({ transcript, count: 1, outDir });
        expect(result.images).toHaveLength(1);
        expect(result.images[0].mediaType).toBe('image/jpeg');
        expect(fs.readFileSync(result.images[0].path).toString()).toBe('second-image');

        const both = recoverPastedImages({ transcript, count: 5, outDir });
        expect(both.images).toHaveLength(2);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('clamps count to 20 recovered images per call', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-clamp-'));
        const transcript = path.join(dir, 'session.jsonl');
        const lines = Array.from({ length: 25 }, (_, i) =>
            imageLine(
                `img-${i}`,
                `2026-08-03T02:00:${String(i).padStart(2, '0')}.000Z`,
                'image/png',
            ),
        );
        fs.writeFileSync(transcript, lines.join('\n'));

        const result = recoverPastedImages({
            transcript,
            count: 999,
            outDir: path.join(dir, 'out'),
        });
        expect(result.images).toHaveLength(20);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('fails with guidance when no images exist', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-rec-'));
        const transcript = path.join(dir, 'empty.jsonl');
        fs.writeFileSync(
            transcript,
            JSON.stringify({ message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
        );
        expect(() => recoverPastedImages({ transcript })).toThrow('No pasted images');
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe.skipIf(onWindows)('locateTranscript (via recoverPastedImages)', () => {
    it('picks the session with the newest image timestamp, resisting mtime misdirection', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-home-'));
        const cwd = '/tmp/proj';
        const dir = path.join(home, '.claude', 'projects', '-tmp-proj');
        fs.mkdirSync(dir, { recursive: true });

        // session a: older image, but file touched later (concurrent activity)
        fs.writeFileSync(
            path.join(dir, 'a.jsonl'),
            imageLine('old-image', '2026-08-03T01:00:00.000Z'),
        );
        // session b: the actual paste, newer image timestamp, older mtime
        fs.writeFileSync(
            path.join(dir, 'b.jsonl'),
            imageLine('new-image', '2026-08-03T02:00:00.000Z'),
        );
        const past = new Date(Date.now() - 60_000);
        fs.utimesSync(path.join(dir, 'b.jsonl'), past, past);

        const realHome = process.env.HOME;
        process.env.HOME = home;
        try {
            const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
            expect(result.transcript.endsWith('b.jsonl')).toBe(true);
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('new-image');
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});

describe.skipIf(onWindows)('transcriptForSession', () => {
    it('targets the exact session file and errors on a missing one', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-sess-'));
        const cwd = '/tmp/proj';
        const dir = path.join(home, '.claude', 'projects', '-tmp-proj');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'aaaa-bbbb.jsonl'),
            imageLine('exact-image', '2026-08-03T03:00:00.000Z'),
        );
        // decoy with a newer image, to prove --session wins over auto-locate
        fs.writeFileSync(
            path.join(dir, 'cccc-dddd.jsonl'),
            imageLine('decoy-image', '2026-08-03T04:00:00.000Z'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        try {
            const result = recoverPastedImages({
                cwd,
                session: 'aaaa-bbbb',
                outDir: path.join(home, 'out'),
            });
            expect(result.transcript.endsWith('aaaa-bbbb.jsonl')).toBe(true);
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('exact-image');
            expect(() => recoverPastedImages({ cwd, session: 'missing-id' })).toThrow(
                'No session missing-id with pasted images',
            );
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});

describe.skipIf(onWindows)('pi harness support', () => {
    it('recovers pi-format images and reports the harness', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-pi-'));
        const cwd = '/tmp/proj';
        const dir = path.join(home, '.pi', 'agent', 'sessions', '--tmp-proj--');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, '2026-08-03T14-18-04-595Z_uuid-1.jsonl'),
            piImageLine('pi-image', '2026-08-03T05:00:00.000Z'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        try {
            const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
            expect(result.harness).toBe('pi');
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('pi-image');
            const bySession = recoverPastedImages({
                cwd,
                session: 'uuid-1',
                outDir: path.join(home, 'out'),
            });
            expect(bySession.transcript.endsWith('_uuid-1.jsonl')).toBe(true);
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('picks the globally newest image across claude and pi sessions', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-both-'));
        const cwd = '/tmp/proj';
        const claudeDir = path.join(home, '.claude', 'projects', '-tmp-proj');
        const piDir = path.join(home, '.pi', 'agent', 'sessions', '--tmp-proj--');
        fs.mkdirSync(claudeDir, { recursive: true });
        fs.mkdirSync(piDir, { recursive: true });
        fs.writeFileSync(
            path.join(claudeDir, 'c.jsonl'),
            imageLine('claude-older', '2026-08-03T01:00:00.000Z'),
        );
        fs.writeFileSync(
            path.join(piDir, '2026-08-03T14-00-00-000Z_p.jsonl'),
            piImageLine('pi-newer', '2026-08-03T02:00:00.000Z'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        try {
            const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
            expect(result.harness).toBe('pi');
            expect(fs.readFileSync(result.images[0].path).toString()).toBe('pi-newer');
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});

describe('harness detection scoping', () => {
    it.skipIf(onWindows)(
        'scopes recovery to the detected harness even when another store has newer images',
        () => {
            const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-scope-'));
            const cwd = '/tmp/proj';
            const claudeDir = path.join(home, '.claude', 'projects', '-tmp-proj');
            fs.mkdirSync(claudeDir, { recursive: true });
            fs.writeFileSync(
                path.join(claudeDir, 'c.jsonl'),
                imageLine('claude-newer', '2026-08-04T09:00:00.000Z'),
            );
            const piDir = path.join(home, '.pi', 'agent', 'sessions', '--tmp-proj--');
            fs.mkdirSync(piDir, { recursive: true });
            fs.writeFileSync(
                path.join(piDir, '2026-08-04T01-00-00-000Z_abcd.jsonl'),
                piImageLine('pi-older', '2026-08-04T01:00:00.000Z'),
            );

            const realHome = process.env.HOME;
            process.env.HOME = home;
            process.env.MODLENS_HARNESS = 'pi';
            try {
                const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
                expect(result.harness).toBe('pi');
                expect(result.detected).toBe('pi');
                expect(fs.readFileSync(result.images[0].path).toString()).toBe('pi-older');
            } finally {
                process.env.HOME = realHome;
                fs.rmSync(home, { recursive: true, force: true });
            }
        },
    );

    it.skipIf(onWindows)(
        'refuses to fall through to other stores when the detected harness has nothing',
        () => {
            const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-scope2-'));
            const cwd = '/tmp/proj';
            const claudeDir = path.join(home, '.claude', 'projects', '-tmp-proj');
            fs.mkdirSync(claudeDir, { recursive: true });
            fs.writeFileSync(
                path.join(claudeDir, 'c.jsonl'),
                imageLine('stale-claude', '2026-08-04T09:00:00.000Z'),
            );

            const realHome = process.env.HOME;
            process.env.HOME = home;
            process.env.MODLENS_HARNESS = 'opencode';
            try {
                expect(() => recoverPastedImages({ cwd, outDir: path.join(home, 'out') })).toThrow(
                    /No pasted images/,
                );
            } finally {
                process.env.HOME = realHome;
                fs.rmSync(home, { recursive: true, force: true });
            }
        },
    );

    it('rejects recover-paste in codex with path-tag guidance', () => {
        process.env.MODLENS_HARNESS = 'codex';
        expect(() => recoverPastedImages({ cwd: '/tmp/nowhere' })).toThrow(/Codex session/);
    });

    it.skipIf(onWindows)(
        'auto-targets the exact Claude Code session from the injected env var',
        () => {
            const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-envsess-'));
            const cwd = '/tmp/proj';
            const claudeDir = path.join(home, '.claude', 'projects', '-tmp-proj');
            fs.mkdirSync(claudeDir, { recursive: true });
            // decoy holds the newer image; env session must still win
            fs.writeFileSync(
                path.join(claudeDir, 'decoy.jsonl'),
                imageLine('decoy-newer', '2026-08-04T09:00:00.000Z'),
            );
            fs.writeFileSync(
                path.join(claudeDir, 'env-sess.jsonl'),
                imageLine('mine', '2026-08-04T01:00:00.000Z'),
            );

            const realHome = process.env.HOME;
            process.env.HOME = home;
            process.env.MODLENS_HARNESS = 'claude-code';
            process.env.CLAUDE_CODE_SESSION_ID = 'env-sess';
            try {
                const result = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
                expect(result.transcript.endsWith('env-sess.jsonl')).toBe(true);
                expect(fs.readFileSync(result.images[0].path).toString()).toBe('mine');

                // an env session with no transcript must fall back to scanning
                process.env.CLAUDE_CODE_SESSION_ID = 'gone-sess';
                const fallback = recoverPastedImages({ cwd, outDir: path.join(home, 'out') });
                expect(fs.readFileSync(fallback.images[0].path).toString()).toBe('decoy-newer');
            } finally {
                process.env.HOME = realHome;
                fs.rmSync(home, { recursive: true, force: true });
            }
        },
    );
});

describe.skipIf(onWindows)('cross-project safety', () => {
    it('rejects a transcript that records no cwd at all (fail closed over slug collisions)', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-nocwd-'));
        const slugDir = path.join(
            home,
            '.claude',
            'projects',
            claudeProjectSlug('/tmp/project-alpha'),
        );
        fs.mkdirSync(slugDir, { recursive: true });
        // A transcript with images but not a single cwd record: the slug alone
        // cannot prove project ownership, so scanning must skip it.
        fs.writeFileSync(
            path.join(slugDir, 'legacy.jsonl'),
            imageLine('cwdless', '2026-08-05T09:00:00.000Z', 'image/png', null),
        );
        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            expect(() =>
                recoverPastedImages({ cwd: '/tmp/project-alpha', outDir: path.join(home, 'out') }),
            ).toThrow(/No pasted images/);
            // The explicit --transcript escape hatch still reads it.
            const explicit = recoverPastedImages({
                cwd: '/tmp/project-alpha',
                transcript: path.join(slugDir, 'legacy.jsonl'),
                outDir: path.join(home, 'out'),
            });
            expect(fs.readFileSync(explicit.images[0].path).toString()).toBe('cwdless');
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('rejects a transcript whose recorded cwd belongs to another project', () => {
        // /tmp/project.alpha and /tmp/project-alpha share one Claude slug.
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-collide-'));
        const slugDir = path.join(
            home,
            '.claude',
            'projects',
            claudeProjectSlug('/tmp/project-alpha'),
        );
        fs.mkdirSync(slugDir, { recursive: true });
        fs.writeFileSync(
            path.join(slugDir, 'other.jsonl'),
            imageLine(
                'other-project',
                '2026-08-05T09:00:00.000Z',
                'image/png',
                '/tmp/project.alpha',
            ),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            expect(() =>
                recoverPastedImages({ cwd: '/tmp/project-alpha', outDir: path.join(home, 'out') }),
            ).toThrow(/No pasted images/);
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('keeps recovered images private to this user', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-perm-'));
        const dir = path.join(home, '.claude', 'projects', claudeProjectSlug('/tmp/p'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'c.jsonl'),
            imageLine('secret', '2026-08-05T09:00:00.000Z', 'image/png', '/tmp/p'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            const outDir = path.join(home, 'out');
            const result = recoverPastedImages({ cwd: '/tmp/p', outDir });
            expect(fs.statSync(result.images[0].path).mode & 0o777).toBe(0o600);
            expect(fs.statSync(outDir).mode & 0o777).toBe(0o700);
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('refuses a pre-existing group- or world-accessible out-dir', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-outdir-'));
        const dir = path.join(home, '.claude', 'projects', claudeProjectSlug('/tmp/p'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'c.jsonl'),
            imageLine('secret', '2026-08-05T09:00:00.000Z', 'image/png', '/tmp/p'),
        );

        // A directory someone else could have pre-created 0755 on a shared box.
        const outDir = path.join(home, 'shared-out');
        fs.mkdirSync(outDir);
        fs.chmodSync(outDir, 0o755);

        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            expect(() => recoverPastedImages({ cwd: '/tmp/p', outDir })).toThrow(
                /group- or world-accessible/,
            );
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('mints a private per-call directory when no out-dir is given', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-default-out-'));
        const dir = path.join(home, '.claude', 'projects', claudeProjectSlug('/tmp/p'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'c.jsonl'),
            imageLine('secret', '2026-08-05T09:00:00.000Z', 'image/png', '/tmp/p'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            const a = recoverPastedImages({ cwd: '/tmp/p' });
            const b = recoverPastedImages({ cwd: '/tmp/p' });
            const dirA = path.dirname(a.images[0].path);
            const dirB = path.dirname(b.images[0].path);
            // Each call gets its own unpredictable directory, created 0700.
            expect(dirA).not.toBe(dirB);
            expect(fs.statSync(dirA).mode & 0o777).toBe(0o700);
            fs.rmSync(dirA, { recursive: true, force: true });
            fs.rmSync(dirB, { recursive: true, force: true });
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('keeps an unmapped media type instead of relabelling it png', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-mime-'));
        const dir = path.join(home, '.claude', 'projects', claudeProjectSlug('/tmp/p'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'c.jsonl'),
            imageLine('heic-bytes', '2026-08-05T09:00:00.000Z', 'image/heic', '/tmp/p'),
        );

        const realHome = process.env.HOME;
        process.env.HOME = home;
        process.env.MODLENS_HARNESS = 'none';
        try {
            const result = recoverPastedImages({ cwd: '/tmp/p', outDir: path.join(home, 'out') });
            expect(result.images[0].path.endsWith('.heic')).toBe(true);
        } finally {
            process.env.HOME = realHome;
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});
