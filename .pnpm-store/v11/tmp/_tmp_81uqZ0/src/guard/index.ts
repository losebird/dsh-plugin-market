// The invocation guard (issue #15): keep the vision engine from firing when
// the active model already has native vision. Three signals feed the verdict,
// strongest first: the MODLENS_MODEL env var (the user said so), session
// storage (the transcript said so), then the caller's --model self-report
// (the model said so, and a model can misname itself).
import { detectHarnessDetailed } from '../recoverPaste/detect.ts';
import { type SniffRoots, sniffModel } from './modelSniff.ts';
import {
    allowPatterns,
    denyPatterns,
    evaluateGuard,
    type GuardsConfig,
    type GuardVerdict,
    type ModelDetection,
} from './rules.ts';

export type { GuardsConfig, GuardVerdict, ModelDetection } from './rules.ts';
export { evaluateGuard } from './rules.ts';

export interface DetectModelOptions {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    /** The calling agent's own claim of what model it is (weakest signal). */
    selfReported?: string;
    /** A harness the caller already detected, so detection is not repeated. */
    harness?: string | null;
    /** Storage locations, injectable for tests. */
    roots?: SniffRoots;
}

export function detectActiveModel(options: DetectModelOptions): ModelDetection {
    const env = options.env ?? process.env;
    const envModel = env.MODLENS_MODEL?.trim();
    if (envModel) {
        return envModel.toLowerCase() === 'none'
            ? { model: null, source: 'env' }
            : { model: envModel, source: 'env' };
    }
    // The MODLENS_HARNESS override comes from the env we were given, since
    // detection itself only consults process.env. Set-but-empty means "not
    // forced", same as detect.ts reads it.
    const forced = env.MODLENS_HARNESS;
    const harness =
        forced === 'none'
            ? null
            : forced ||
              (options.harness !== undefined ? options.harness : detectHarnessDetailed().harness);
    const sniffed = harness ? sniffModel(harness, options.cwd, env, options.roots) : null;
    if (sniffed) {
        const detection: ModelDetection = {
            model: sniffed.model,
            source: 'storage',
            harness,
        };
        if (sniffed.provider) {
            detection.provider = sniffed.provider;
        }
        if (
            options.selfReported &&
            options.selfReported.toLowerCase() !== sniffed.model.toLowerCase()
        ) {
            detection.selfReported = options.selfReported;
        }
        return detection;
    }
    if (options.selfReported) {
        return { model: options.selfReported, source: 'self-report', harness };
    }
    return { model: null, source: 'none', harness };
}

export function runGuard(
    guards: GuardsConfig | undefined,
    options: DetectModelOptions,
): GuardVerdict {
    // With no rule that could ever deny, the verdict needs no model: skip the
    // detection work (a ps spawn plus session-storage reads) entirely. An
    // allowlist denies everything off the list, so it counts as such a rule.
    // doctor composes detectActiveModel + evaluateGuard itself to keep its
    // rich view.
    if (
        denyPatterns(guards).length === 0 &&
        allowPatterns(guards).length === 0 &&
        guards?.denyWhenUnknown !== true
    ) {
        return { model: null, source: 'none', guard: 'allow', reason: 'no deny rules configured' };
    }
    return evaluateGuard(guards, detectActiveModel(options));
}
