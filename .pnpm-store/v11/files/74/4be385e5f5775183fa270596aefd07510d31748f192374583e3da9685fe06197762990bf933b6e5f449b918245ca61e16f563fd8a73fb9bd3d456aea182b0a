import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { VISION_RESULT_SCHEMA } from '../schema.ts';
import { buildClaudeCliInvocation, parseClaudeCliOutput } from './claudeCli.ts';

describe('buildClaudeCliInvocation', () => {
    it('builds a Read-only claude print invocation with json schema', () => {
        const invocation = buildClaudeCliInvocation({
            imageSource: '/tmp/shots/pic.png',
            imageKind: 'local',
            timeoutMs: 60_000,
        });
        expect(invocation.command).toBe('claude');
        expect(invocation.args[invocation.args.indexOf('--allowedTools') + 1]).toBe('Read');
        expect(invocation.args).not.toContain('--dangerously-skip-permissions');
        expect(invocation.args[invocation.args.indexOf('--model') + 1]).toBe('haiku');
        const schemaArg = invocation.args[invocation.args.indexOf('--json-schema') + 1] as string;
        expect(JSON.parse(schemaArg)).toEqual(VISION_RESULT_SCHEMA);
        // buildInvocation resolves the cwd; compare against the resolved form so
        // the drive-rooted Windows path matches too.
        expect(invocation.cwd).toBe(path.resolve('/tmp/shots'));
    });

    it('rejects remote urls with guidance', () => {
        expect(() =>
            buildClaudeCliInvocation({
                imageSource: 'https://example.com/a.png',
                imageKind: 'remote',
                timeoutMs: 1000,
            }),
        ).toThrow('local files only');
    });
});

describe('parseClaudeCliOutput', () => {
    const structured = { summary: 'ok', uncertainty: [] };

    it('parses the result envelope', () => {
        const parsed = parseClaudeCliOutput(
            JSON.stringify({
                type: 'result',
                subtype: 'success',
                is_error: false,
                result: JSON.stringify(structured),
                session_id: 'sid',
                duration_ms: 11148,
                usage: { output_tokens: 328 },
            }),
        );
        expect(parsed.result).toEqual(structured);
        expect(parsed.meta.conversationId).toBe('sid');
        expect(parsed.meta.durationSeconds).toBeCloseTo(11.148);
    });

    it('prefers structured_output when the result string is not strict JSON (#22)', () => {
        // Newer claude CLI envelopes carry the schema-parsed object alongside
        // the result string; unescaped newlines in the string used to fail the
        // whole read while the good object sat unread.
        const parsed = parseClaudeCliOutput(
            JSON.stringify({
                type: 'result',
                subtype: 'success',
                is_error: false,
                result: '{"ocr": {"full_text": "line one\nline two"}}'.replace('\\n', '\n'),
                structured_output: structured,
                session_id: 'sid-2',
                duration_ms: 900,
            }),
        );
        expect(parsed.result).toEqual(structured);
        expect(parsed.meta.conversationId).toBe('sid-2');
    });

    it('falls back to loose parsing of the result string without structured_output (#22)', () => {
        // A fenced or prose-wrapped result should still be salvaged before
        // giving up, matching the antigravity provider's behavior.
        const parsed = parseClaudeCliOutput(
            JSON.stringify({
                subtype: 'success',
                is_error: false,
                result: '```json\n{"summary": "ok", "uncertainty": []}\n```',
                session_id: 'sid-3',
            }),
        );
        expect(parsed.result).toEqual(structured);
    });

    it('throws on error envelopes and empty results', () => {
        expect(() =>
            parseClaudeCliOutput(
                JSON.stringify({ is_error: true, subtype: 'error', result: 'boom' }),
            ),
        ).toThrow('Claude CLI reported error');
        expect(() =>
            parseClaudeCliOutput(JSON.stringify({ subtype: 'success', result: '' })),
        ).toThrow('no result');
    });
});
