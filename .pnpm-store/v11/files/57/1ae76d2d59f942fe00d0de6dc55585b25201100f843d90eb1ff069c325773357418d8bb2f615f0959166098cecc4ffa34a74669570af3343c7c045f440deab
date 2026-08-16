// Gemini Developer API provider: direct generateContent call with a free
// AI Studio key. Structured output enforced via responseJsonSchema.
import { fetchRemoteImageBase64, readLocalImageBase64 } from '../imageInput.ts';
import { apiFetch } from '../net/proxy.ts';
import { buildVisionPrompt } from '../prompt.ts';
import { VISION_RESULT_SCHEMA } from '../schema.ts';
import { mergeExtraBody } from '../util/extraBody.ts';
import { truncate } from '../util/json.ts';
import { redactSecrets } from '../util/redact.ts';
import type {
    BuildProviderInvocationOptions,
    ProviderParsedOutput,
    VisionProvider,
} from './index.ts';

export const GEMINI_API_DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

export async function executeGeminiApi(
    options: BuildProviderInvocationOptions,
): Promise<ProviderParsedOutput> {
    const apiKey = options.settings?.apiKey;
    if (!apiKey) {
        throw new Error(
            'gemini-api provider needs an API key. Set GEMINI_API_KEY, or run: modlens config set gemini-api.apiKey <key> (free key: https://aistudio.google.com)',
        );
    }

    const model = options.model || options.settings?.model || GEMINI_API_DEFAULT_MODEL;
    const baseUrl = (options.settings?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

    const image =
        options.imageKind === 'remote'
            ? await fetchRemoteImageBase64(options.imageSource, options.timeoutMs)
            : readLocalImageBase64(options.imageSource);

    const prompt = buildVisionPrompt({
        imageSource: options.imageSource,
        imageKind: 'inline',
        extraPrompt: options.extraPrompt,
    });

    const startedAt = Date.now();
    const response = await apiFetch(
        `${baseUrl}/v1beta/models/${model}:generateContent`,
        {
            method: 'POST',
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(
                mergeExtraBody(
                    {
                        contents: [
                            {
                                parts: [
                                    {
                                        inline_data: {
                                            mime_type: image.mimeType,
                                            data: image.data,
                                        },
                                    },
                                    { text: prompt },
                                ],
                            },
                        ],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseJsonSchema: VISION_RESULT_SCHEMA,
                        },
                    },
                    options.settings?.extraBody,
                    [
                        'contents',
                        'generationConfig.responseMimeType',
                        'generationConfig.responseJsonSchema',
                    ],
                    'gemini-api',
                ),
            ),
            signal: AbortSignal.timeout(options.timeoutMs),
        },
        options.settings?.proxy,
    );

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Gemini API error ${response.status}: ${truncate(redactSecrets(body, [apiKey]))}`,
        );
    }

    const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: unknown;
    };

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) {
        throw new Error('Gemini API returned no text candidate.');
    }

    let result: unknown;
    try {
        result = JSON.parse(text);
    } catch {
        throw new Error(`Gemini API returned non-JSON output: ${truncate(text)}`);
    }

    return {
        result,
        meta: {
            conversationId: null,
            durationSeconds: (Date.now() - startedAt) / 1000,
            usage: payload.usageMetadata ?? null,
        },
    };
}

export const geminiApiProvider: VisionProvider = {
    name: 'gemini-api',
    defaultModel: GEMINI_API_DEFAULT_MODEL,
    execute: executeGeminiApi,
};
