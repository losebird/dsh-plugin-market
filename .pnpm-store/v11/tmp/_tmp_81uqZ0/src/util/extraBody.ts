// Vendor-specific request-body passthrough. Every gateway spells its own knobs
// differently (thinking on/off is the loudest example: `thinking.type` here,
// `reasoning_effort` there, `chat_template_kwargs.enable_thinking` on a
// self-hosted vLLM, and strict clouds 400 on anything they do not know), so
// modlens carries no per-vendor table. The user names the fields, modlens
// merges them into the request it was going to send anyway.

import { parseJsonOrExplain } from './json.ts';

/** Parse an --extra-body / config value into an object, or explain why not. */
export function parseExtraBody(raw: string, origin: string): Record<string, unknown> {
    const parsed = parseJsonOrExplain(raw, origin);
    if (!isPlainObject(parsed)) {
        throw new Error(
            `${origin} must be a JSON object, for example {"thinking":{"type":"disabled"}}`,
        );
    }
    return parsed;
}

/**
 * Deep-merge the user's fields into a request body. Nested objects merge key by
 * key so `{"generationConfig":{"thinkingConfig":{...}}}` adds a knob instead of
 * replacing the whole block; arrays and scalars replace outright.
 *
 * `reserved` lists dotted paths the passthrough must not touch: the image, the
 * prompt, and the schema enforcement are the contract of this tool, and
 * silently overriding them would return something that is not a vision result.
 */
export function mergeExtraBody(
    body: Record<string, unknown>,
    extra: Record<string, unknown> | undefined,
    reserved: string[],
    providerName: string,
): Record<string, unknown> {
    if (!extra || Object.keys(extra).length === 0) {
        return body;
    }

    for (const path of reserved) {
        if (hasPath(extra, path)) {
            throw new Error(
                `extraBody cannot override "${path}" for the ${providerName} provider: it carries the image, the prompt, or the schema this tool depends on. Remove that field from ${providerName}.extraBody (or --extra-body).`,
            );
        }
    }

    return deepMerge(body, extra);
}

function deepMerge(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const current = merged[key];
        merged[key] =
            isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
    }
    return merged;
}

function hasPath(value: Record<string, unknown>, dottedPath: string): boolean {
    let cursor: unknown = value;
    for (const segment of dottedPath.split('.')) {
        if (!isPlainObject(cursor) || !Object.hasOwn(cursor, segment)) {
            return false;
        }
        cursor = cursor[segment];
    }
    return true;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
