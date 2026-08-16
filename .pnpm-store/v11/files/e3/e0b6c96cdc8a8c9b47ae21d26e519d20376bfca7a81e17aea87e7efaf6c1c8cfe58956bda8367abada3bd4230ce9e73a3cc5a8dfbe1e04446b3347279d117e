import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeProjectSlug } from '../recoverPaste/adapters/claude.ts';
import { detectActiveModel, runGuard } from './index.ts';

// The suite itself runs inside a real harness; keep detection out of the way.
beforeEach(() => {
    process.env.MODLENS_HARNESS = 'none';
});
afterEach(() => {
    delete process.env.MODLENS_HARNESS;
});

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-guard-'));
}

// The two storage-backed cases lean on claudeProjectSlug, which does not
// define a Windows layout (see the note in modelSniff.test.ts).
const onWindows = process.platform === 'win32';

function claudeFixture(cwd: string, model: string): { claudeProjectsDir: string } {
    const projects = tempDir();
    const dir = path.join(projects, claudeProjectSlug(cwd));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, 's.jsonl'),
        [
            JSON.stringify({ cwd, message: { role: 'user', content: [] } }),
            JSON.stringify({ message: { role: 'assistant', model } }),
        ].join('\n'),
    );
    return { claudeProjectsDir: projects };
}

describe('detectActiveModel', () => {
    it('lets MODLENS_MODEL override everything, with "none" meaning explicitly unknown', () => {
        const detection = detectActiveModel({
            cwd: '/repo',
            env: { MODLENS_MODEL: 'gpt-5.6-sol', MODLENS_HARNESS: 'none' },
            selfReported: 'claude-fable-5',
        });
        expect(detection).toMatchObject({ model: 'gpt-5.6-sol', source: 'env' });
        expect(
            detectActiveModel({ cwd: '/repo', env: { MODLENS_MODEL: 'none' } }).model,
        ).toBeNull();
    });

    it.skipIf(onWindows)(
        'prefers storage evidence over the self-report and records the disagreement',
        () => {
            const cwd = tempDir();
            const roots = claudeFixture(cwd, 'deepseek-v4-flash');
            const detection = detectActiveModel({
                cwd,
                env: { MODLENS_HARNESS: 'claude-code' },
                selfReported: 'claude-3.7-sonnet',
                roots,
            });
            expect(detection).toMatchObject({
                model: 'deepseek-v4-flash',
                source: 'storage',
                harness: 'claude-code',
                selfReported: 'claude-3.7-sonnet',
            });
        },
    );

    it('falls back to the self-report when storage yields nothing, then to unknown', () => {
        const roots = { claudeProjectsDir: path.join(tempDir(), 'missing') };
        const env = { MODLENS_HARNESS: 'claude-code' };
        expect(
            detectActiveModel({ cwd: '/repo', env, selfReported: 'deepseek-v4-flash', roots }),
        ).toMatchObject({ model: 'deepseek-v4-flash', source: 'self-report' });
        expect(detectActiveModel({ cwd: '/repo', env, roots })).toMatchObject({
            model: null,
            source: 'none',
        });
    });

    it.skipIf(onWindows)(
        'treats a set-but-empty MODLENS_HARNESS as not forced, like detect.ts does',
        () => {
            const cwd = tempDir();
            const roots = claudeFixture(cwd, 'deepseek-v4-flash');
            const detection = detectActiveModel({
                cwd,
                env: { MODLENS_HARNESS: '' },
                harness: 'claude-code',
                roots,
            });
            expect(detection).toMatchObject({ model: 'deepseek-v4-flash', source: 'storage' });
        },
    );
});

describe('runGuard', () => {
    it('skips model detection entirely when no rule could ever deny', () => {
        // MODLENS_MODEL would be picked up if detection ran: its absence from
        // the verdict is the proof the short-circuit fired.
        const verdict = runGuard(
            {},
            { cwd: '/repo', env: { MODLENS_MODEL: 'gpt-5.6-sol', MODLENS_HARNESS: 'none' } },
        );
        expect(verdict).toMatchObject({
            guard: 'allow',
            model: null,
            source: 'none',
            reason: 'no deny rules configured',
        });
    });

    it('still detects when denyWhenUnknown alone is set', () => {
        const verdict = runGuard(
            { denyWhenUnknown: true },
            { cwd: '/repo', env: { MODLENS_HARNESS: 'none' } },
        );
        expect(verdict.guard).toBe('deny');
    });

    it('still detects when only allowModels is configured', () => {
        // An allowlist denies everything off the list, so the short-circuit
        // must not swallow it: MODLENS_MODEL showing up in the verdict proves
        // detection ran.
        const verdict = runGuard(
            { allowModels: ['deepseek-v4-*'] },
            { cwd: '/repo', env: { MODLENS_MODEL: 'claude-fable-5', MODLENS_HARNESS: 'none' } },
        );
        expect(verdict).toMatchObject({ guard: 'deny', model: 'claude-fable-5', source: 'env' });
    });
});
