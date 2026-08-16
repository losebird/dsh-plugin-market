#!/usr/bin/env node
// Local eval runner. Drives the built modlens CLI over the seed cases and writes
// one evidence artifact per case, then prints a pass/latency summary.
//
// This spends real provider quota, so it is on-demand and never runs in CI.
// Usage:
//   node evals/run.mjs                 # all cases, real run
//   node evals/run.mjs chart banner    # named cases only
//   node evals/run.mjs --dry-run       # validate cases + inputs, no provider call
//   node evals/run.mjs --provider gemini-api --model gemini-3.6-flash
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const evalsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evalsDir, '..');
const casesDir = path.join(evalsDir, 'cases');
const cli = path.join(repoRoot, 'dist', 'main.js');

function parseArgs(argv) {
    const ids = [];
    const opts = { dryRun: false, provider: undefined, model: undefined };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') opts.dryRun = true;
        else if (arg === '--provider') opts.provider = argv[++i];
        else if (arg === '--model') opts.model = argv[++i];
        else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`);
        else ids.push(arg);
    }
    return { ids, opts };
}

function loadCases(ids) {
    const dirs = fs
        .readdirSync(casesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => ids.length === 0 || ids.includes(name))
        .sort();
    return dirs.map((name) => {
        const file = path.join(casesDir, name, 'case.json');
        const spec = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return { name, file, spec };
    });
}

function sha256(file) {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function toolInfo() {
    const version = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
    ).version;
    const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf-8',
    });
    const commit = git.status === 0 ? git.stdout.trim() : null;
    return { version, commit };
}

// Mirror of src/schema.ts missingSchemaFields, kept minimal.
function missingSchemaFields(result) {
    const missing = [];
    const root = result ?? {};
    const child = (k) => (root[k] && typeof root[k] === 'object' ? root[k] : {});
    const expect = (p, ok) => {
        if (!ok) missing.push(p);
    };
    expect('summary', typeof root.summary === 'string');
    expect('ocr.full_text', typeof child('ocr').full_text === 'string');
    expect('ocr.lines', Array.isArray(child('ocr').lines));
    expect('layout.regions', Array.isArray(child('layout').regions));
    expect('semantics.scene', typeof child('semantics').scene === 'string');
    expect('semantics.entities', Array.isArray(child('semantics').entities));
    expect('uncertainty', Array.isArray(root.uncertainty));
    return missing;
}

function scoreResult(result, expect) {
    const haystack = JSON.stringify(result).toLowerCase();
    const mustTranscribe = (expect.mustTranscribe ?? []).map((text) => ({
        text,
        found: haystack.includes(text.toLowerCase()),
    }));
    const numbers = (expect.numbers ?? []).map((n) => ({
        value: String(n),
        found: haystack.includes(String(n).toLowerCase()),
    }));
    const regionTypesPresent = new Set(
        (result?.layout?.regions ?? []).map((r) => r?.type).filter(Boolean),
    );
    const regionTypes = (expect.regionTypes ?? []).map((type) => ({
        type,
        found: regionTypesPresent.has(type),
    }));
    const schemaMissing = missingSchemaFields(result);
    return {
        mustTranscribe,
        numbers,
        regionTypes,
        transcriptionPass: mustTranscribe.every((m) => m.found) && numbers.every((n) => n.found),
        schemaPass: schemaMissing.length === 0,
        schemaMissing,
    };
}

function runCase(entry, opts, tool, resultsDir) {
    const { name, spec } = entry;
    const image = path.resolve(repoRoot, spec.image);
    if (!fs.existsSync(image)) {
        return { name, status: 'error', error: `input image not found: ${image}` };
    }
    const inputSha256 = sha256(image);

    if (opts.dryRun) {
        const expectOk = spec.expect && Array.isArray(spec.expect.mustTranscribe);
        return {
            name,
            status: expectOk ? 'validated' : 'invalid',
            inputSha256,
            image: spec.image,
            note: expectOk ? undefined : 'case.json missing expect.mustTranscribe',
        };
    }

    const provider = opts.provider ?? spec.provider ?? undefined;
    const model = opts.model ?? spec.model ?? undefined;
    const args = [cli, '-i', image];
    if (provider) args.push('-p', provider);
    if (model) args.push('-m', model);
    if (spec.prompt) args.push('--prompt', spec.prompt);

    const startedAt = Date.now();
    const proc = spawnSync('node', args, {
        cwd: repoRoot,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 300_000,
    });
    const latencyMs = Date.now() - startedAt;

    let analyze = null;
    let parseError = null;
    if (proc.stdout) {
        try {
            analyze = JSON.parse(proc.stdout);
        } catch (e) {
            parseError = e.message;
        }
    }

    const failed = proc.status !== 0 || !analyze;
    const scoring = analyze ? scoreResult(analyze.result, spec.expect) : null;

    const artifact = {
        case: name,
        title: spec.title ?? name,
        category: spec.category ?? null,
        command: ['modlens', ...args.slice(1).map((a) => (a === image ? spec.image : a))].join(' '),
        runDate: new Date().toISOString(),
        tool,
        provider: analyze?.provider ?? provider ?? '(default)',
        model: analyze?.meta?.model ?? model ?? '(default)',
        inputSha256,
        latencyMs,
        usage: analyze?.meta?.usage ?? null,
        expected: spec.expect,
        scoring,
        rawOutput: analyze,
        error: failed
            ? { code: proc.status, message: parseError ?? undefined, stderr: proc.stderr?.trim() }
            : null,
        degraded: analyze && provider && analyze.provider !== provider
            ? `requested ${provider}, ran ${analyze.provider}`
            : null,
    };

    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

    return {
        name,
        status: failed ? 'error' : 'ran',
        latencyMs,
        transcriptionPass: scoring?.transcriptionPass ?? false,
        schemaPass: scoring?.schemaPass ?? false,
        scoring,
        error: failed ? artifact.error : null,
        artifactPath: path.join(resultsDir, `${name}.json`),
    };
}

function main() {
    const { ids, opts } = parseArgs(process.argv.slice(2));
    if (!opts.dryRun && !fs.existsSync(cli)) {
        process.stderr.write(`Build first: ${cli} is missing. Run: pnpm build\n`);
        process.exit(1);
    }
    const tool = toolInfo();
    const cases = loadCases(ids);
    if (cases.length === 0) {
        process.stderr.write('No matching cases.\n');
        process.exit(1);
    }

    const date = new Date().toISOString().slice(0, 10);
    const resultsDir = path.join(evalsDir, 'results', date);
    const results = cases.map((entry) => runCase(entry, opts, tool, resultsDir));

    process.stdout.write(`\nmodlens eval  (${opts.dryRun ? 'dry-run' : 'live'})\n`);
    process.stdout.write(`tool ${tool.version} @ ${tool.commit ?? 'unknown'}\n\n`);

    for (const r of results) {
        if (opts.dryRun) {
            process.stdout.write(`  ${r.status === 'validated' ? 'ok ' : '!! '}${r.name}  ${r.status}\n`);
            continue;
        }
        const mark = r.status === 'ran' && r.transcriptionPass && r.schemaPass ? 'ok ' : '!! ';
        const detail =
            r.status === 'error'
                ? `error: ${r.error?.message ?? r.error?.stderr ?? `exit ${r.error?.code}`}`
                : `transcribe ${r.transcriptionPass ? 'pass' : 'FAIL'}, schema ${r.schemaPass ? 'pass' : 'FAIL'}, ${r.latencyMs} ms`;
        process.stdout.write(`  ${mark}${r.name}: ${detail}\n`);
        if (r.scoring) {
            const misses = r.scoring.mustTranscribe.filter((m) => !m.found).map((m) => m.text);
            if (misses.length) process.stdout.write(`       missing text: ${misses.join(' | ')}\n`);
        }
    }

    if (!opts.dryRun) {
        const ran = results.filter((r) => r.status === 'ran');
        const latencies = ran.map((r) => r.latencyMs);
        const passRate = results.length
            ? ran.filter((r) => r.transcriptionPass).length / results.length
            : 0;
        const schemaRate = results.length
            ? ran.filter((r) => r.schemaPass).length / results.length
            : 0;
        process.stdout.write('\nsummary\n');
        process.stdout.write(`  transcription pass rate: ${(passRate * 100).toFixed(0)}%\n`);
        process.stdout.write(`  schema pass rate:        ${(schemaRate * 100).toFixed(0)}%\n`);
        if (latencies.length) {
            const sum = latencies.reduce((a, b) => a + b, 0);
            process.stdout.write(
                `  latency ms  min ${Math.min(...latencies)}  avg ${Math.round(sum / latencies.length)}  max ${Math.max(...latencies)}\n`,
            );
        }
        process.stdout.write(`  artifacts: ${resultsDir}\n`);
    } else {
        const bad = results.filter((r) => r.status !== 'validated');
        process.stdout.write(`\n${results.length - bad.length}/${results.length} cases valid\n`);
        if (bad.length) process.exitCode = 1;
    }
}

main();
