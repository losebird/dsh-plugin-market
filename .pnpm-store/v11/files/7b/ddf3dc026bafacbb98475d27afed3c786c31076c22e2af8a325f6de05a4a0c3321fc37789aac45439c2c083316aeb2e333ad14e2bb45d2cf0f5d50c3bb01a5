import { describe, expect, it } from 'vitest';
import { mergeExtraBody, parseExtraBody } from './extraBody.ts';

describe('parseExtraBody', () => {
    it('accepts an object and names the origin when it cannot', () => {
        expect(parseExtraBody('{"thinking":{"type":"disabled"}}', '--extra-body')).toEqual({
            thinking: { type: 'disabled' },
        });
        expect(() => parseExtraBody('{nope', '--extra-body')).toThrow('--extra-body is not valid');
        expect(() => parseExtraBody('[1,2]', 'openai.extraBody')).toThrow(
            'openai.extraBody must be a JSON object',
        );
        expect(() => parseExtraBody('"off"', 'openai.extraBody')).toThrow('must be a JSON object');
    });
});

describe('mergeExtraBody', () => {
    const body = () => ({
        model: 'm',
        messages: [{ role: 'user' }],
        generationConfig: { responseMimeType: 'application/json', temperature: 1 },
    });

    it('returns the body untouched when there is nothing to merge', () => {
        const original = body();
        expect(mergeExtraBody(original, undefined, [], 'openai')).toBe(original);
        expect(mergeExtraBody(original, {}, [], 'openai')).toBe(original);
    });

    it('adds vendor fields without disturbing the rest', () => {
        const merged = mergeExtraBody(
            body(),
            { thinking: { type: 'disabled' }, reasoning_effort: 'none' },
            ['model', 'messages'],
            'openai',
        );
        expect(merged.thinking).toEqual({ type: 'disabled' });
        expect(merged.reasoning_effort).toBe('none');
        expect(merged.messages).toEqual([{ role: 'user' }]);
    });

    it('merges nested objects key by key instead of replacing the block', () => {
        // The Gemini case: adding a thinking knob must not drop the schema
        // enforcement that lives in the same generationConfig.
        const merged = mergeExtraBody(
            body(),
            { generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } } },
            ['generationConfig.responseMimeType'],
            'gemini-api',
        );
        const generationConfig = merged.generationConfig as Record<string, unknown>;
        expect(generationConfig.responseMimeType).toBe('application/json');
        expect(generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    });

    it('refuses reserved fields, top level and nested, and says which', () => {
        expect(() => mergeExtraBody(body(), { messages: [] }, ['messages'], 'openai')).toThrow(
            'cannot override "messages" for the openai provider',
        );
        expect(() =>
            mergeExtraBody(
                body(),
                { generationConfig: { responseJsonSchema: {} } },
                ['generationConfig.responseJsonSchema'],
                'gemini-api',
            ),
        ).toThrow('cannot override "generationConfig.responseJsonSchema"');
    });

    it('does not leave the caller mutated', () => {
        const original = body();
        mergeExtraBody(original, { generationConfig: { temperature: 0 } }, [], 'gemini-api');
        expect((original.generationConfig as { temperature: number }).temperature).toBe(1);
    });
});
