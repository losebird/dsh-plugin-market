// Claude Code CLI provider: rides an existing `claude` login, no API key.
// Permissions stay tight: only the Read tool is allowed, enough to view the
// image and nothing else. Structured output enforced via --json-schema.
import * as path from 'path';
import { buildVisionPrompt } from '../prompt.ts';
import { visionResultSchemaJson } from '../schema.ts';
import { extractJson, parseJsonLoose, truncate } from '../util/json.ts';
import type {
    BuildProviderInvocationOptions,
    ProviderInvocation,
    ProviderParsedOutput,
    VisionProvider,
} from './index.ts';

export const CLAUDE_CLI_DEFAULT_MODEL = 'haiku';

interface ClaudePrintEnvelope {
    type?: string;
    subtype?: string;
    is_error?: boolean;
    result?: string;
    /** Newer claude CLI: the schema-parsed object beside the result string. */
    structured_output?: unknown;
    session_id?: string;
    duration_ms?: number;
    usage?: unknown;
    [key: string]: unknown;
}

export function buildClaudeCliInvocation(
    options: BuildProviderInvocationOptions,
): ProviderInvocation {
    if (options.imageKind === 'remote') {
        throw new Error(
            'claude-cli provider reads local files only. Download the image first, or use -p gemini-api for remote URLs.',
        );
    }

    const prompt = buildVisionPrompt({
        imageSource: options.imageSource,
        imageKind: 'local',
        extraPrompt: options.extraPrompt,
    });

    const args = [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--json-schema',
        visionResultSchemaJson(),
        '--allowedTools',
        'Read',
        '--model',
        options.model || options.settings?.model || CLAUDE_CLI_DEFAULT_MODEL,
    ];

    return {
        command: options.providerBin || 'claude',
        args,
        cwd: path.resolve(options.workdir || path.dirname(options.imageSource)),
    };
}

export function parseClaudeCliOutput(stdout: string): ProviderParsedOutput {
    const envelope = parseEnvelope(stdout);

    if (envelope.is_error || (envelope.subtype && envelope.subtype !== 'success')) {
        throw new Error(
            `Claude CLI reported ${envelope.subtype ?? 'an error'}: ${truncate(envelope.result ?? '')}`,
        );
    }

    if (
        envelope.structured_output === undefined &&
        (typeof envelope.result !== 'string' || !envelope.result.trim())
    ) {
        throw new Error('Claude CLI output contains no result. Check login state (run: claude).');
    }

    // structured_output is the schema-parsed object newer CLIs ship beside
    // the result string; when present it is authoritative (issue #22: the
    // string can carry unescaped newlines that fail strict parsing while the
    // good object sits right there). Without it, salvage a fenced or
    // prose-wrapped string before giving up, like the antigravity provider.
    const result: unknown =
        envelope.structured_output ??
        (typeof envelope.result === 'string' ? extractJson(envelope.result) : null);
    if (result === null || result === undefined) {
        throw new Error(`Claude CLI returned non-JSON result: ${truncate(envelope.result ?? '')}`);
    }

    return {
        result,
        meta: {
            conversationId: envelope.session_id ?? null,
            durationSeconds:
                typeof envelope.duration_ms === 'number' ? envelope.duration_ms / 1000 : null,
            usage: envelope.usage ?? null,
        },
    };
}

function parseEnvelope(stdout: string): ClaudePrintEnvelope {
    const parsed = parseJsonLoose(stdout);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Failed to parse Claude CLI JSON output.');
    }
    return parsed as ClaudePrintEnvelope;
}

export const claudeCliProvider: VisionProvider = {
    name: 'claude-cli',
    defaultModel: CLAUDE_CLI_DEFAULT_MODEL,
    buildInvocation: buildClaudeCliInvocation,
    parseOutput: parseClaudeCliOutput,
    isolateWorkdir: true,
};
