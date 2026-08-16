import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { executeOpenaiCompat } from './openaiCompat.ts';

// A full instance of the contract: the shape check now requires every field,
// because a gateway returning half of it is not a usable vision result.
const structured = {
    summary: 'ok',
    ocr: { full_text: '', lines: [] },
    layout: { regions: [] },
    semantics: { scene: '', intent: '', entities: [], relations: [] },
    visual: { dominant_colors: [], style: '', notes: [] },
    uncertainty: [],
};
let tmpImage: string;

beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-oai-'));
    tmpImage = path.join(dir, 'x.png');
    fs.writeFileSync(tmpImage, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const settings = { apiKey: 'sk-x', baseUrl: 'https://gw.example.com/v1', model: 'qwen3.6-27b' };

describe('executeOpenaiCompat', () => {
    it('demands baseUrl, apiKey, and model up front', async () => {
        await expect(
            executeOpenaiCompat({
                imageSource: tmpImage,
                imageKind: 'local',
                timeoutMs: 5000,
                settings: { apiKey: 'k' },
            }),
        ).rejects.toThrow('baseUrl, apiKey, and model');
    });

    it('sends a template-instance prompt, not a raw json schema', async () => {
        const calls: Array<{ init: RequestInit }> = [];
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            calls.push({ init });
            return new Response(
                JSON.stringify({ choices: [{ message: { content: JSON.stringify(structured) } }] }),
                { status: 200 },
            );
        });

        await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings,
        });

        const body = JSON.parse(String(calls[0].init.body));
        const text = body.messages[0].content.find((b: { type: string }) => b.type === 'text').text;
        expect(text).toContain('Fill this exact structure');
        expect(text).not.toContain('"type":"object"');
    });

    it('redacts the api key and token shapes out of gateway error bodies', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(
                    'unauthorized: key sk-x rejected (sent Authorization: Bearer sk-proj-abc123DEF456ghi789)',
                    { status: 401 },
                ),
        );
        const error = await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings: { ...settings, apiKey: 'sk-x-full-key-value' },
        }).catch((e: Error) => e.message);
        expect(error).toContain('401');
        expect(error).not.toContain('sk-proj-abc123DEF456ghi789');
        expect(error).not.toContain('sk-x-full-key-value');
        expect(error).toContain('[redacted]');
    });

    it('merges extraBody into the request and guards the fields it needs', async () => {
        const calls: Array<{ init: RequestInit }> = [];
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            calls.push({ init });
            return new Response(
                JSON.stringify({ choices: [{ message: { content: JSON.stringify(structured) } }] }),
                { status: 200 },
            );
        });

        await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings: { ...settings, extraBody: { thinking: { type: 'disabled' } } },
        });

        const body = JSON.parse(String(calls[0].init.body));
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body.messages[0].content).toHaveLength(2);

        await expect(
            executeOpenaiCompat({
                imageSource: tmpImage,
                imageKind: 'local',
                timeoutMs: 5000,
                settings: { ...settings, extraBody: { messages: [] } },
            }),
        ).rejects.toThrow('cannot override "messages"');
    });

    it('extracts fenced JSON from lax gateways', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(
                    JSON.stringify({
                        choices: [
                            {
                                message: {
                                    content: `\`\`\`json\n${JSON.stringify(structured)}\n\`\`\``,
                                },
                            },
                        ],
                        usage: { total_tokens: 5 },
                    }),
                    { status: 200 },
                ),
        );

        const parsed = await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings,
        });
        expect(parsed.result).toEqual(structured);
    });

    it('fails loudly when the gateway returns schema-shaped or wrong JSON', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(
                    JSON.stringify({
                        choices: [{ message: { content: '{"type":"object","properties":{}}' } }],
                    }),
                    { status: 200 },
                ),
        );

        await expect(
            executeOpenaiCompat({
                imageSource: tmpImage,
                imageKind: 'local',
                timeoutMs: 5000,
                settings,
            }),
        ).rejects.toThrow('does not match the vision schema');
    });
});

describe('structured output (#37)', () => {
    const capture = () => {
        const calls: Array<{ init: RequestInit }> = [];
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            calls.push({ init });
            return new Response(
                JSON.stringify({ choices: [{ message: { content: JSON.stringify(structured) } }] }),
                { status: 200 },
            );
        });
        return calls;
    };

    it('asks the gateway to enforce the contract only when told to', async () => {
        const calls = capture();
        await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings: { ...settings, structuredOutput: true },
        });
        const body = JSON.parse(String(calls[0].init.body));
        expect(body.response_format.type).toBe('json_schema');
        expect(body.response_format.json_schema.strict).toBe(true);
        // The derived strict form, not the contract verbatim: the gateway
        // rejects a schema with optional properties.
        const schema = body.response_format.json_schema.schema;
        expect(schema.additionalProperties).toBe(false);
        expect(schema.properties.visual.properties.notes.anyOf[1]).toEqual({ type: 'null' });
    });

    it('sends nothing extra by default, since a gateway can 400 on it', async () => {
        const calls = capture();
        await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings,
        });
        expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('response_format');
    });

    it('lets extraBody override the derived schema', async () => {
        // Someone with a gateway that wants a different shape keeps the
        // escape hatch they already had.
        const calls = capture();
        await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings: {
                ...settings,
                structuredOutput: true,
                extraBody: { response_format: { type: 'json_object' } },
            },
        });
        expect(JSON.parse(String(calls[0].init.body)).response_format).toEqual({
            type: 'json_object',
        });
    });
});

describe('empty optionals on the openai route (#37)', () => {
    it('drops them at its own parse boundary', async () => {
        const quiet = {
            ...structured,
            ocr: { full_text: '', lines: [{ text: 'a', language: null }] },
            semantics: {
                scene: '',
                intent: null,
                entities: [{ name: 'e', type: 't', evidence: null }],
                relations: null,
            },
            visual: { dominant_colors: null, style: null, notes: null },
        };
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(
                    JSON.stringify({ choices: [{ message: { content: JSON.stringify(quiet) } }] }),
                    { status: 200 },
                ),
        );
        const outcome = await executeOpenaiCompat({
            imageSource: tmpImage,
            imageKind: 'local',
            timeoutMs: 5000,
            settings,
        });
        expect(JSON.stringify(outcome.result)).not.toContain('null');
        const result = outcome.result as {
            ocr: { lines: Array<Record<string, unknown>> };
            semantics: Record<string, unknown>;
            visual: Record<string, unknown>;
        };
        const entity = (result.semantics.entities as Array<Record<string, unknown>>)[0];
        for (const [holder, field] of [
            [result.ocr.lines[0], 'language'],
            [result.semantics, 'intent'],
            [result.semantics, 'relations'],
            [entity, 'evidence'],
            [result.visual, 'dominant_colors'],
            [result.visual, 'style'],
            [result.visual, 'notes'],
        ] as Array<[Record<string, unknown>, string]>) {
            expect(field in holder, `${field} survived`).toBe(false);
        }
        expect(result.ocr.lines[0].text).toBe('a');
        expect(entity.name).toBe('e');
    });
});

describe('schema shape enforcement', () => {
    it('rejects a partial result that used to pass the token check', async () => {
        // {"summary":"x","ocr":null} satisfied the old check and reached the model
        // as if it were evidence.
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    choices: [
                        { message: { content: JSON.stringify({ summary: 'x', ocr: null }) } },
                    ],
                }),
            })),
        );
        await expect(
            executeOpenaiCompat({
                imageSource: 'https://example.com/a.png',
                imageKind: 'remote',
                timeoutMs: 1000,
                settings: { apiKey: 'k', baseUrl: 'https://api.example.com', model: 'm' },
            }),
        ).rejects.toThrow(/does not match the vision schema \(wrong or missing: ocr, layout/);
    });
});
