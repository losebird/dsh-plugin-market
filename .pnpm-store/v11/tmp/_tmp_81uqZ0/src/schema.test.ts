import { describe, expect, it } from 'vitest';
import {
    type JsonSchemaNode,
    missingSchemaFields,
    normalizeVisionResult,
    schemaViolations,
    strictSchema,
    VISION_RESULT_SCHEMA,
    visionResponseFormat,
} from './schema.ts';

const VALID = {
    summary: 'a tweet screenshot',
    ocr: { full_text: 'hello', lines: [{ text: 'hello', language: 'en' }] },
    layout: { regions: [{ type: 'paragraph', reading_order: 1, text: 'hello' }] },
    semantics: {
        scene: 'social media',
        entities: [{ name: 'hello', type: 'text' }],
        relations: [{ subject: 'a', predicate: 'is', object: 'b' }],
    },
    visual: { dominant_colors: ['#fff'], style: 'flat', notes: ['clean'] },
    uncertainty: ['small text unreadable'],
};

/** Every path the schema declares but does not require, in document order. */
function optionalPaths(node: JsonSchemaNode, prefix: string): string[] {
    if (node.type === 'array' && node.items) {
        return optionalPaths(node.items, `${prefix}[]`);
    }
    if (node.type !== 'object') {
        return [];
    }
    const found: string[] = [];
    for (const [key, child] of Object.entries(node.properties ?? {})) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        if (!(node.required?.includes(key) ?? false)) {
            found.push(childPath);
        }
        found.push(...optionalPaths(child, childPath));
    }
    return found;
}

describe('missingSchemaFields', () => {
    it('accepts a fully valid result', () => {
        expect(missingSchemaFields(VALID)).toEqual([]);
    });

    it('checks array elements, not just array existence', () => {
        // These exact shells used to pass when only Array.isArray was checked.
        const broken = structuredClone(VALID) as Record<string, unknown>;
        (broken.ocr as { lines: unknown }).lines = [42];
        (broken.uncertainty as unknown[]) = [1, 2];
        const missing = missingSchemaFields(broken);
        expect(missing).toContain('ocr.lines[0]');
        expect(missing).toContain('uncertainty[0]');
        expect(missing).toContain('uncertainty[1]');
    });

    it('checks field types inside array elements', () => {
        const broken = structuredClone(VALID);
        broken.layout.regions[0].reading_order = 'first' as unknown as number;
        expect(missingSchemaFields(broken)).toContain('layout.regions[0].reading_order');
    });

    it('accepts a region kind outside the common vocabulary', () => {
        // Region kinds are an open set: a closed list rejected `link` on any
        // web screenshot, and a rejected result fails the whole read over a
        // descriptive label (issue #34).
        const open = structuredClone(VALID);
        open.layout.regions[0].type = 'link';
        expect(missingSchemaFields(open)).toEqual([]);
        open.layout.regions[0].type = 'search';
        expect(missingSchemaFields(open)).toEqual([]);
    });

    it('carries the region vocabulary in the schema, not only in the prompt template', () => {
        // Dropping the enum also dropped the only hint those kinds existed.
        // The description restores it for gemini, anthropic, agy, and
        // claude-cli, which send this schema and not the JSON template.
        const kind =
            VISION_RESULT_SCHEMA.properties.layout.properties.regions.items.properties.type;
        expect(kind.description).toContain('paragraph');
        expect(kind.description).toContain('link');
        expect(kind).not.toHaveProperty('enum');
    });

    it('drops null on a field the schema does not require, rather than passing it on', () => {
        // A model with nothing to note writes null, and leaving the field out
        // was already fine, so the read used to die over an empty list
        // (issue #37). Dropping the key keeps the promise the docs make:
        // absent, or the declared type, never null.
        const quiet = structuredClone(VALID) as Record<string, unknown>;
        const visual = quiet.visual as Record<string, unknown>;
        visual.notes = null;
        visual.style = null;
        const clean = normalizeVisionResult(quiet) as typeof VALID;
        expect(missingSchemaFields(clean)).toEqual([]);
        expect('notes' in clean.visual).toBe(false);
        expect('style' in clean.visual).toBe(false);
        expect(clean.visual.dominant_colors).toEqual(['#fff']);
    });

    it('drops an empty optional at every place the contract has one', () => {
        // Every optional field, so a null can never reach a caller that was
        // promised an array or a string.
        const noisy = {
            ...structuredClone(VALID),
            ocr: { full_text: 'hello', lines: [{ text: 'hello', language: null }] },
            semantics: {
                scene: 'social media',
                intent: null,
                entities: [{ name: 'hello', type: 'text', evidence: null }],
                relations: null,
            },
            visual: { dominant_colors: null, style: null, notes: null },
        } as unknown;
        const clean = normalizeVisionResult(noisy) as Record<string, never>;
        expect(missingSchemaFields(clean)).toEqual([]);
        expect(JSON.stringify(clean)).not.toContain('null');
        // And the required neighbours survive untouched.
        const typed = clean as unknown as typeof VALID;
        expect(typed.ocr.lines[0].text).toBe('hello');
        expect(typed.semantics.entities[0].name).toBe('hello');
    });

    it('still refuses null where the contract requires a value', () => {
        const empty = structuredClone(VALID) as Record<string, unknown>;
        empty.visual = null;
        expect(missingSchemaFields(empty)).toEqual(['visual']);
        const noText = structuredClone(VALID);
        noText.ocr.lines[0].text = null as unknown as string;
        expect(missingSchemaFields(noText)).toContain('ocr.lines[0].text');
    });

    it('still enforces an enum wherever one is declared', () => {
        // The vision schema declares none, so this pins the machinery
        // directly: a future enum must not pass unchecked.
        const schema = {
            type: 'object',
            properties: { kind: { type: 'string', enum: ['a', 'b'] } },
            required: ['kind'],
        } as const;
        expect(schemaViolations(schema, { kind: 'a' }, '')).toEqual([]);
        expect(schemaViolations(schema, { kind: 'z' }, '')).toContain('kind');
    });

    it('validates optional fields when they are present', () => {
        const broken = structuredClone(VALID) as Record<string, unknown>;
        (broken.visual as Record<string, unknown>).dominant_colors = 'red';
        expect(missingSchemaFields(broken)).toContain('visual.dominant_colors');
    });

    it('reports required fields that are missing entirely', () => {
        expect(missingSchemaFields({ summary: 'only this' })).toEqual([
            'ocr',
            'layout',
            'semantics',
            'visual',
            'uncertainty',
        ]);
        expect(missingSchemaFields(null)).toEqual(['(root)']);
    });

    it('stays in step with the provider schema: every runtime requirement is declared there', () => {
        // One source of truth: the walk reads VISION_RESULT_SCHEMA directly, so
        // this asserts the schema itself still requires what the docs promise.
        expect([...VISION_RESULT_SCHEMA.required]).toEqual([
            'summary',
            'ocr',
            'layout',
            'semantics',
            'visual',
            'uncertainty',
        ]);
    });
});

describe('strict schema for structured output (#37)', () => {
    it('requires every property and makes the optional ones nullable', () => {
        const schema = strictSchema(VISION_RESULT_SCHEMA as JsonSchemaNode);
        // Strict mode has no optional properties: everything is required, and
        // what this contract does not require becomes nullable instead.
        expect(schema.required).toEqual(Object.keys(schema.properties ?? {}));
        expect(schema.additionalProperties).toBe(false);
        const visual = schema.properties?.visual;
        expect(visual?.required).toEqual(['dominant_colors', 'style', 'notes']);
        expect(visual?.properties?.notes?.anyOf?.[1]).toEqual({ type: 'null' });
        // A required one keeps its plain shape.
        expect(schema.properties?.summary).toEqual({ type: 'string' });
    });

    it('carries the same fields as the contract it is derived from', () => {
        // Derived, not written out, so a field added to one cannot go missing
        // from the other.
        const schema = strictSchema(VISION_RESULT_SCHEMA as JsonSchemaNode);
        expect(Object.keys(schema.properties ?? {})).toEqual(
            Object.keys(VISION_RESULT_SCHEMA.properties),
        );
        const format = visionResponseFormat() as {
            type: string;
            json_schema: { name: string; strict: boolean; schema: JsonSchemaNode };
        };
        expect(format.type).toBe('json_schema');
        expect(format.json_schema.strict).toBe(true);
        expect(format.json_schema.schema).toEqual(schema);
    });

    it('descends into array items', () => {
        const schema = strictSchema(VISION_RESULT_SCHEMA as JsonSchemaNode);
        const line = schema.properties?.ocr?.properties?.lines?.items;
        expect(line?.additionalProperties).toBe(false);
        expect(line?.properties?.language?.anyOf?.[1]).toEqual({ type: 'null' });
        expect(line?.properties?.text).toEqual({ type: 'string' });
    });
});

describe('docs contract', () => {
    it('output-schema.md lists exactly the required fields the schema enforces', () => {
        const fs = require('fs');
        const path = require('path');
        const doc = fs.readFileSync(
            path.join(__dirname, '..', 'docs', 'output-schema.md'),
            'utf-8',
        ) as string;
        const line = doc.split('\n').find((l: string) => l.startsWith('Required fields:'));
        expect(line).toBeDefined();
        for (const field of VISION_RESULT_SCHEMA.required) {
            expect(line).toContain(`\`${field}\``);
        }
        // And nothing is called optional that the schema requires.
        expect(line).not.toMatch(/`visual` is optional/);
    });

    it('both output-schema languages list exactly the optional fields, no more', () => {
        // The docs promise these are absent-or-typed and never null, which is
        // only true while each list matches the schema exactly (issue #37).
        // Equality, not containment: a path listed but no longer optional is
        // as wrong as one missing.
        const fs = require('fs');
        const path = require('path');
        const expected = new Set(optionalPaths(VISION_RESULT_SCHEMA as JsonSchemaNode, ''));
        for (const [file, prefix] of [
            ['output-schema.md', 'Optional fields:'],
            ['output-schema.zh-CN.md', '可选字段：'],
        ]) {
            const doc = fs.readFileSync(
                path.join(__dirname, '..', 'docs', file),
                'utf-8',
            ) as string;
            const line = doc.split('\n').find((l: string) => l.startsWith(prefix));
            expect(line, `${file} has no optional-fields line`).toBeDefined();
            // Only the list itself: the sentence after it mentions `null`,
            // which is a promise about those fields rather than one of them.
            const list = (line ?? '').split(/\.\s|。/)[0];
            const listed = new Set([...list.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
            expect(listed, `${file} does not match the schema`).toEqual(expected);
        }
    });
});
