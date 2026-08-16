import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildDoctorReport, renderDoctorReport } from './doctor.ts';

// A PATH pointing at a directory holding a fake executable, so binary detection
// is deterministic instead of depending on what the test machine has installed.
function pathWith(bins: string[]): { dir: string; PATH: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-bin-'));
    for (const bin of bins) {
        const full = path.join(dir, bin);
        fs.writeFileSync(full, '#!/bin/sh\n', { mode: 0o755 });
    }
    return { dir, PATH: dir };
}

// The suite runs inside a real harness; force a deterministic verdict.
function withForcedHarness<T>(value: string, run: () => T): T {
    const prev = process.env.MODLENS_HARNESS;
    process.env.MODLENS_HARNESS = value;
    try {
        return run();
    } finally {
        if (prev === undefined) {
            delete process.env.MODLENS_HARNESS;
        } else {
            process.env.MODLENS_HARNESS = prev;
        }
    }
}

function providerNamed(report: ReturnType<typeof buildDoctorReport>, name: string) {
    const found = report.providers.find((p) => p.name === name);
    if (!found) {
        throw new Error(`provider ${name} missing from report`);
    }
    return found;
}

describe('buildDoctorReport: Node and node:sqlite', () => {
    it('reports the running Node version against the 22.19 floor', () => {
        const report = buildDoctorReport({ config: {}, env: {} });
        expect(report.node.version).toBe(process.version);
        expect(report.node.minimum).toBe('22.19');
        // The suite runs on a supported runtime (CI matrix is 22 and 24).
        expect(report.node.meetsMinimum).toBe(true);
        expect(typeof report.nodeSqlite.available).toBe('boolean');
    });
});

describe('buildDoctorReport: provider readiness', () => {
    it('marks a subprocess provider ready only when its binary is on PATH', () => {
        const missing = buildDoctorReport({ config: {}, env: { PATH: '' } });
        const agyMissing = providerNamed(missing, 'antigravity-cli');
        expect(agyMissing.ready).toBe(false);
        expect(agyMissing.status).toBe('missing');
        expect(agyMissing.fix).toContain('antigravity.google');

        const { dir, PATH } = pathWith(['agy']);
        try {
            const found = buildDoctorReport({ config: {}, env: { PATH } });
            const agy = providerNamed(found, 'antigravity-cli');
            expect(agy.ready).toBe(true);
            // On PATH proves installation, not a working login: the machine
            // status says 'installed', never 'ready', for subprocess CLIs.
            expect(agy.status).toBe('installed');
            expect(agy.authUnverified).toBe(true);
            expect(agy.binaryPath).toBe(path.join(dir, 'agy'));
            expect(agy.fix).toBeUndefined();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reads an API key from env, overriding the config file, and tags the source', () => {
        const config = { providers: { 'gemini-api': { apiKey: 'from-file-key' } } };
        const report = buildDoctorReport({
            config,
            env: { GEMINI_API_KEY: 'from-env-key' },
        });
        const gemini = providerNamed(report, 'gemini-api');
        expect(gemini.ready).toBe(true);
        expect(gemini.status).toBe('ready');
        expect(gemini.settings?.[0]).toMatchObject({ field: 'apiKey', source: 'env' });
    });

    it('tags a config-file-only key as file and flags a missing one', () => {
        const fromFile = buildDoctorReport({
            config: { providers: { 'gemini-api': { apiKey: 'from-file-key' } } },
            env: {},
        });
        expect(providerNamed(fromFile, 'gemini-api').settings?.[0].source).toBe('file');

        const absent = buildDoctorReport({ config: {}, env: {} });
        const gemini = providerNamed(absent, 'gemini-api');
        expect(gemini.ready).toBe(false);
        expect(gemini.settings?.[0].source).toBe('missing');
        expect(gemini.fix).toContain('gemini-api.apiKey');
    });

    it('needs baseUrl, apiKey, and model for the openai provider', () => {
        const partial = buildDoctorReport({
            config: { providers: { openai: { apiKey: 'k', baseUrl: 'https://x' } } },
            env: {},
        });
        const openai = providerNamed(partial, 'openai');
        expect(openai.ready).toBe(false);
        expect(openai.detail).toContain('model');
    });
});

describe('buildDoctorReport: selection layer', () => {
    it('uses the built-in default when nothing selects a provider', () => {
        const report = buildDoctorReport({ config: {}, env: {} });
        expect(report.selection).toMatchObject({
            provider: 'antigravity-cli',
            canonical: 'antigravity-cli',
            source: 'default',
        });
    });

    it('reports the config provider when set, resolving aliases to canonical', () => {
        const report = buildDoctorReport({ config: { provider: 'gemini' }, env: {} });
        expect(report.selection).toMatchObject({
            provider: 'gemini',
            canonical: 'gemini-api',
            source: 'config',
        });
    });

    it('lets a -p flag win over the config provider', () => {
        const report = buildDoctorReport({
            config: { provider: 'gemini-api' },
            env: {},
            providerFlag: 'anthropic',
        });
        expect(report.selection).toMatchObject({ provider: 'anthropic', source: 'flag' });
    });
});

describe('buildDoctorReport: harness basis', () => {
    it('reports a forced harness as coming from the override', () => {
        const report = withForcedHarness('claude-code', () =>
            buildDoctorReport({ config: {}, env: {} }),
        );
        expect(report.harness).toEqual({ detected: 'claude-code', source: 'override' });
    });

    it('reports none when the override disables detection', () => {
        const report = withForcedHarness('none', () => buildDoctorReport({ config: {}, env: {} }));
        expect(report.harness).toEqual({ detected: null, source: 'override' });
    });
});

describe('buildDoctorReport: config file permissions', () => {
    // POSIX permission bits: Windows reports 0o666 for every file and enforces
    // access through ACLs instead, so the doctor skips this verdict there.
    it.skipIf(process.platform === 'win32')(
        'accepts a 0600 config and flags a group/world-readable one',
        () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-cfg-'));
            try {
                const locked = path.join(dir, 'locked.json');
                fs.writeFileSync(locked, '{}', { mode: 0o600 });
                fs.chmodSync(locked, 0o600);
                const okReport = buildDoctorReport({ config: {}, env: {}, configPath: locked });
                expect(okReport.config).toMatchObject({
                    exists: true,
                    permissionsOk: true,
                    mode: '600',
                });

                const loose = path.join(dir, 'loose.json');
                fs.writeFileSync(loose, '{}', { mode: 0o644 });
                fs.chmodSync(loose, 0o644);
                const looseReport = buildDoctorReport({ config: {}, env: {}, configPath: loose });
                expect(looseReport.config.permissionsOk).toBe(false);
                expect(looseReport.config.note).toContain('chmod 600');
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        },
    );

    it('treats a missing config file as fine, not an error', () => {
        const report = buildDoctorReport({
            config: {},
            env: {},
            configPath: path.join(os.tmpdir(), 'modlens-does-not-exist-xyz', 'config.json'),
        });
        expect(report.config).toMatchObject({ exists: false, permissionsOk: true });
    });
});

describe('buildDoctorReport: guard', () => {
    it('evaluates the guard on the spot so "why did it skip" answers itself', () => {
        const report = buildDoctorReport({
            config: { guards: { denyModels: ['gpt-5.6*'] } },
            env: { MODLENS_MODEL: 'gpt-5.6-sol', MODLENS_HARNESS: 'none' },
        });
        expect(report.guard).toMatchObject({
            rules: 1,
            denyWhenUnknown: false,
            model: 'gpt-5.6-sol',
            source: 'env',
            verdict: 'deny',
            matched: 'gpt-5.6*',
        });
    });

    it('reports no rules as an allow with zero rules', () => {
        const report = buildDoctorReport({
            config: {},
            env: { MODLENS_HARNESS: 'none' },
        });
        expect(report.guard).toMatchObject({ rules: 0, verdict: 'allow' });
    });

    it('renders a Guard section', () => {
        const report = buildDoctorReport({
            config: { guards: { denyModels: ['gpt-5.6*'] } },
            env: { MODLENS_MODEL: 'gpt-5.6-sol', MODLENS_HARNESS: 'none' },
        });
        const rendered = renderDoctorReport(report);
        expect(rendered).toContain('Guard');
        expect(rendered).toContain('deny');
        expect(rendered).toContain('gpt-5.6*');
    });
});

describe('buildDoctorReport: reuse', () => {
    it('probes the four harnesses fresh and maps grant decisions with defaults', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-doctor-home-'));
        const report = buildDoctorReport({
            config: { reuse: { codex: true, pi: false } },
            env: { PATH: '', MODLENS_HARNESS: 'none' },
            auto: { home },
        });
        expect(report.reuse.decisions).toEqual({
            claude: 'granted',
            codex: 'granted',
            opencode: 'not asked',
            pi: 'refused',
            grok: 'not asked',
        });
        expect(report.reuse.probes.map((p) => p.harness).sort()).toEqual([
            'claude-code',
            'codex',
            'grok',
            'opencode',
            'pi',
        ]);
        expect(report.reuse.probes.every((p) => p.cliFound === false)).toBe(true);
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('renders a Reuse section with decisions and per-harness lines', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-doctor-home-'));
        const report = buildDoctorReport({
            config: {},
            env: { PATH: '', MODLENS_HARNESS: 'none' },
            auto: { home },
        });
        const rendered = renderDoctorReport(report);
        expect(rendered).toContain('Reuse');
        expect(rendered).toContain('codex not asked');
        expect(rendered).toContain('claude granted');
        expect(rendered).toContain('codex: cli not found');
        fs.rmSync(home, { recursive: true, force: true });
    });
});
