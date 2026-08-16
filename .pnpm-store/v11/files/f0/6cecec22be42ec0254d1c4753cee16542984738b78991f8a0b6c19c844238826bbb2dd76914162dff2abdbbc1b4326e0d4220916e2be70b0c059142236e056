// JSON schema enforced on the provider via structured output.
// Fields that vision models tend to fabricate (pixel bboxes, numeric
// confidence) are intentionally excluded.
export const VISION_RESULT_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        ocr: {
            type: 'object',
            properties: {
                full_text: { type: 'string' },
                lines: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            language: { type: 'string' },
                        },
                        required: ['text'],
                    },
                },
            },
            required: ['full_text', 'lines'],
        },
        layout: {
            type: 'object',
            properties: {
                regions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            // Deliberately not an enum. Region kinds are an
                            // open set: a closed list rejected `link` on any
                            // web screenshot and `search` on a portal, and a
                            // rejected result fails the whole read over a
                            // descriptive label (issue #34). The common
                            // vocabulary moves into the description, which
                            // guides without constraining and rides along to
                            // every provider that enforces this schema
                            // server-side.
                            type: {
                                type: 'string',
                                description:
                                    'A short kind for this region. Prefer a common one where it fits: title, heading, paragraph, list, table, chart, form, code, image, icon, link, nav, button, search. Any other short label is fine when none of those describe it.',
                            },
                            reading_order: { type: 'number' },
                            text: { type: 'string' },
                        },
                        required: ['type', 'reading_order', 'text'],
                    },
                },
            },
            required: ['regions'],
        },
        semantics: {
            type: 'object',
            properties: {
                scene: { type: 'string' },
                intent: { type: 'string' },
                entities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            evidence: { type: 'string' },
                        },
                        required: ['name', 'type'],
                    },
                },
                relations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            subject: { type: 'string' },
                            predicate: { type: 'string' },
                            object: { type: 'string' },
                        },
                        required: ['subject', 'predicate', 'object'],
                    },
                },
            },
            required: ['scene', 'entities'],
        },
        visual: {
            type: 'object',
            properties: {
                dominant_colors: { type: 'array', items: { type: 'string' } },
                style: { type: 'string' },
                notes: { type: 'array', items: { type: 'string' } },
            },
        },
        uncertainty: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'ocr', 'layout', 'semantics', 'visual', 'uncertainty'],
} as const;

/**
 * The same contract in the shape OpenAI's structured-output mode demands:
 * every property listed in `required`, `additionalProperties: false`
 * everywhere, and the ones this schema does not require made nullable so a
 * model with nothing to say can still answer. Derived from the schema above
 * rather than written out, so the two cannot drift, and only used when a
 * gateway is asked to enforce it (issue #37: hand-writing this by hand was
 * the workaround it replaces).
 */
export function strictSchema(node: JsonSchemaNode): JsonSchemaNode {
    if (node.type === 'object') {
        const properties: Record<string, JsonSchemaNode> = {};
        const required = node.required ?? [];
        for (const [key, child] of Object.entries(node.properties ?? {})) {
            const strict = strictSchema(child);
            properties[key] = required.includes(key)
                ? strict
                : // Strict mode has no optional properties, only nullable ones.
                  { anyOf: [strict, { type: 'null' }] };
        }
        return {
            type: 'object',
            properties,
            required: Object.keys(properties),
            additionalProperties: false,
        };
    }
    if (node.type === 'array' && node.items) {
        return { ...node, items: strictSchema(node.items) };
    }
    return node;
}

/** The vision contract as an OpenAI `response_format` value. */
export function visionResponseFormat(): Record<string, unknown> {
    return {
        type: 'json_schema',
        json_schema: {
            name: 'vision_result',
            strict: true,
            schema: strictSchema(VISION_RESULT_SCHEMA),
        },
    };
}

export function visionResultSchemaJson(): string {
    return JSON.stringify(VISION_RESULT_SCHEMA);
}

/**
 * The paths where a result violates the vision contract: absent required
 * fields, wrong types, wrong element types inside arrays, values outside an
 * enum. Empty means the result matches.
 *
 * Server-side schema enforcement only covers some routes (gemini responseSchema,
 * anthropic tool input_schema, agy/claude-cli --json-schema), and even those can
 * hand back a shell that only looks right. This is the portable check the
 * analyzer runs over every provider's result, so a structurally broken payload
 * fails loudly instead of reaching the caller as if it were evidence.
 *
 * The walk is driven by VISION_RESULT_SCHEMA itself, so the provider schema and
 * this runtime check can never disagree: there is one source of truth.
 */
export function missingSchemaFields(result: unknown): string[] {
    return schemaViolations(VISION_RESULT_SCHEMA as JsonSchemaNode, result, '');
}

/**
 * The result with `null` removed wherever this contract asks for nothing. A
 * model with no visual notes writes `notes: null`, and leaving the field out
 * was always fine, so the two say the same thing and rejecting one of them
 * cost a whole read over an empty list (issue #37). Dropping the key rather
 * than passing the null through is what keeps the promise the docs make:
 * every field is absent or holds its declared type, never null, so nothing
 * downstream has to guard against a shape the schema never advertised.
 *
 * A null on a required field is left in place, so the check that follows
 * still refuses it: something was supposed to be there.
 */
export function withoutEmptyOptionals(value: unknown, schema: JsonSchemaNode): unknown {
    if (schema.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return value;
        }
        const record = value as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(record)) {
            const childSchema = schema.properties?.[key];
            const isRequired = schema.required?.includes(key) ?? false;
            // A key a gateway added on its own is dropped when it is null
            // too: it is the same empty answer, and leaving it in would mean
            // a caller reading the passthrough still has to guard for null.
            if (entry === null && !isRequired) {
                continue;
            }
            cleaned[key] = childSchema ? withoutEmptyOptionals(entry, childSchema) : entry;
        }
        return cleaned;
    }
    if (schema.type === 'array' && schema.items && Array.isArray(value)) {
        const itemSchema = schema.items;
        return value.map((item) => withoutEmptyOptionals(item, itemSchema));
    }
    return value;
}

/** The vision result with its empty optionals dropped. */
export function normalizeVisionResult(result: unknown): unknown {
    return withoutEmptyOptionals(result, VISION_RESULT_SCHEMA as JsonSchemaNode);
}

export interface JsonSchemaNode {
    type?: string;
    properties?: Record<string, JsonSchemaNode>;
    required?: readonly string[];
    items?: JsonSchemaNode;
    enum?: readonly string[];
    // Guidance for the model, ignored by the walk below.
    description?: string;
    // Only produced by strictSchema for a gateway that enforces the contract;
    // the walk never sees these, since it reads VISION_RESULT_SCHEMA.
    anyOf?: JsonSchemaNode[];
    additionalProperties?: boolean;
}

/**
 * Exported for tests: the vision schema itself declares no enum (region kinds
 * are an open set, see above), so enum enforcement has no live caller and
 * would rot untested if it could only be reached through that one schema.
 */
export function schemaViolations(schema: JsonSchemaNode, value: unknown, path: string): string[] {
    const label = path || '(root)';

    if (schema.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return [label];
        }
        const record = value as Record<string, unknown>;
        const violations: string[] = [];
        for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
            const childPath = path ? `${path}.${key}` : key;
            const isRequired = schema.required?.includes(key) ?? false;
            if (!(key in record) || record[key] === undefined) {
                if (isRequired) {
                    violations.push(childPath);
                }
                continue;
            }
            // A present field must match its schema whether required or not.
            violations.push(...schemaViolations(childSchema, record[key], childPath));
        }
        return violations;
    }

    if (schema.type === 'array') {
        if (!Array.isArray(value)) {
            return [label];
        }
        if (!schema.items) {
            return [];
        }
        const itemSchema = schema.items;
        return value.flatMap((item, index) =>
            schemaViolations(itemSchema, item, `${path}[${index}]`),
        );
    }

    if (schema.type === 'string') {
        if (typeof value !== 'string') {
            return [label];
        }
        if (schema.enum && !schema.enum.includes(value)) {
            return [label];
        }
        return [];
    }

    if (schema.type === 'number') {
        return typeof value === 'number' && Number.isFinite(value) ? [] : [label];
    }

    return [];
}
