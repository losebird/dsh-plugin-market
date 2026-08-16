import { describe, expect, it } from 'vitest';
import { evaluateGuard, globMatch } from './rules.ts';

describe('glob matching', () => {
    it('matches * across any run of characters, anchored to the whole name', () => {
        expect(globMatch('gemini-3*', 'gemini-3.1-pro-high')).toBe(true);
        expect(globMatch('gemini-3*', 'gemini-2.5-flash')).toBe(false);
        // Anchored: a pattern without wildcards is an exact name, not a substring.
        expect(globMatch('gpt-5', 'gpt-5.6-sol')).toBe(false);
    });

    it('treats regex metacharacters in the pattern as literals', () => {
        // The dot must not act as "any character".
        expect(globMatch('gpt-5.6', 'gpt-5x6')).toBe(false);
        expect(globMatch('gpt-5.6', 'gpt-5.6')).toBe(true);
        expect(globMatch('claude+web', 'claude+web')).toBe(true);
    });

    it('matches ? as exactly one character and compares case-insensitively', () => {
        expect(globMatch('gpt-?', 'gpt-5')).toBe(true);
        expect(globMatch('gpt-?', 'gpt-55')).toBe(false);
        expect(globMatch('Claude-Fable-*', 'claude-fable-5')).toBe(true);
    });
});

describe('guard evaluation', () => {
    it('denies a model matching a deny pattern and names the matched rule', () => {
        const verdict = evaluateGuard(
            { denyModels: ['gemini-3*', 'gpt-5.6*'] },
            { model: 'gpt-5.6-sol', source: 'storage' },
        );
        expect(verdict.guard).toBe('deny');
        expect(verdict.matched).toBe('gpt-5.6*');
        expect(verdict.model).toBe('gpt-5.6-sol');
    });

    it('allows a model that matches no deny pattern', () => {
        const verdict = evaluateGuard(
            { denyModels: ['gemini-3*'] },
            { model: 'deepseek-v4-flash', source: 'storage' },
        );
        expect(verdict.guard).toBe('allow');
        expect(verdict.matched).toBeUndefined();
    });

    it('also matches provider/model so rules can target a whole provider', () => {
        const verdict = evaluateGuard(
            { denyModels: ['openrouter/*'] },
            { model: 'some-vision-model', provider: 'openrouter', source: 'storage' },
        );
        expect(verdict.guard).toBe('deny');
        expect(verdict.matched).toBe('openrouter/*');
    });

    it('fails open on an unknown model by default', () => {
        const verdict = evaluateGuard(
            { denyModels: ['gemini-3*'] },
            { model: null, source: 'none' },
        );
        expect(verdict.guard).toBe('allow');
        expect(verdict.reason).toContain('unknown');
    });

    it('denies an unknown model when denyWhenUnknown is set', () => {
        const verdict = evaluateGuard(
            { denyModels: ['gemini-3*'], denyWhenUnknown: true },
            { model: null, source: 'none' },
        );
        expect(verdict.guard).toBe('deny');
    });

    it('honors denyWhenUnknown even when denyModels is absent', () => {
        const verdict = evaluateGuard({ denyWhenUnknown: true }, { model: null, source: 'none' });
        expect(verdict.guard).toBe('deny');
    });

    it('treats only boolean true as denyWhenUnknown (hand-edited "false" string stays open)', () => {
        const handEdited = { denyWhenUnknown: 'false' } as unknown as { denyWhenUnknown: boolean };
        expect(evaluateGuard(handEdited, { model: null, source: 'none' }).guard).toBe('allow');
    });

    it('survives a hand-edited config with a malformed denyModels shape', () => {
        // A bare string must not be iterated character by character, and a
        // non-string element must not throw mid-evaluation.
        const asString = { denyModels: 'gemini-3*' } as unknown as { denyModels: string[] };
        expect(evaluateGuard(asString, { model: 'gemini-3.1-pro', source: 'env' }).guard).toBe(
            'allow',
        );
        const mixed = { denyModels: [42, 'gemini-3*'] } as unknown as { denyModels: string[] };
        expect(evaluateGuard(mixed, { model: 'gemini-3.1-pro', source: 'env' }).guard).toBe('deny');
    });

    it('allows with a clear reason when no deny rules are configured', () => {
        for (const guards of [undefined, {}, { denyModels: [] }]) {
            const verdict = evaluateGuard(guards, { model: 'gpt-5.6-sol', source: 'storage' });
            expect(verdict.guard).toBe('allow');
            expect(verdict.reason).toContain('no deny rules');
        }
    });
});

describe('allowlist mode', () => {
    it('allows a model matching an allow pattern and names the matched rule', () => {
        const verdict = evaluateGuard(
            { allowModels: ['deepseek-v4-*', 'glm-5.*'] },
            { model: 'deepseek-v4-flash', source: 'storage' },
        );
        expect(verdict.guard).toBe('allow');
        expect(verdict.matched).toBe('deepseek-v4-*');
    });

    it('denies a known model that matches no allow pattern', () => {
        const verdict = evaluateGuard(
            { allowModels: ['deepseek-v4-*'] },
            { model: 'claude-fable-5', source: 'storage' },
        );
        expect(verdict.guard).toBe('deny');
        expect(verdict.matched).toBeUndefined();
        expect(verdict.reason).toContain('allowModels');
    });

    it('lets a deny pattern carve a vision variant out of a broad allow', () => {
        const verdict = evaluateGuard(
            { allowModels: ['glm-*'], denyModels: ['glm-*v*'] },
            { model: 'glm-5v-turbo', source: 'storage' },
        );
        expect(verdict.guard).toBe('deny');
        expect(verdict.matched).toBe('glm-*v*');
    });

    it('matches allow patterns against provider/model too', () => {
        const verdict = evaluateGuard(
            { allowModels: ['ds-gateway/*'] },
            { model: 'v4-flash', provider: 'ds-gateway', source: 'storage' },
        );
        expect(verdict.guard).toBe('allow');
        expect(verdict.matched).toBe('ds-gateway/*');
    });

    it('keeps failing open on an unknown model unless denyWhenUnknown is set', () => {
        const unknown = { model: null, source: 'none' } as const;
        expect(evaluateGuard({ allowModels: ['deepseek-v4-*'] }, unknown).guard).toBe('allow');
        expect(
            evaluateGuard({ allowModels: ['deepseek-v4-*'], denyWhenUnknown: true }, unknown).guard,
        ).toBe('deny');
    });

    it('treats an empty or malformed allowModels as no allowlist at all', () => {
        for (const allowModels of [[], 'deepseek-v4-*']) {
            const guards = { allowModels } as unknown as { allowModels: string[] };
            const verdict = evaluateGuard(guards, { model: 'claude-fable-5', source: 'storage' });
            expect(verdict.guard).toBe('allow');
        }
    });
});
