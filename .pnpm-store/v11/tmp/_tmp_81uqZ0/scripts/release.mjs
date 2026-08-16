#!/usr/bin/env node
// One command per release, because doing it by hand is how a version once
// shipped to npm with no changelog entry and no tag behind it.
//
//   pnpm release 2.7.8        explicit version
//   pnpm release patch        bump from the current one
//
// The order matters: everything that can refuse to release runs before
// anything irreversible (tag, push) happens.
//
// This script does NOT publish. It runs the guards, bumps the version, commits,
// tags, and pushes the tag. Pushing the tag triggers .github/workflows/release.yml,
// which is the single place that runs `npm publish` and creates the GitHub
// Release. Publishing from both here and CI is a race that double-publishes or
// fails half-way, so the tag push is the one handoff.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampLaunchers } from './stamp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, options = {}) =>
    execFileSync(cmd, args, { cwd: root, encoding: 'utf-8', stdio: 'pipe', ...options }).trim();
const runLoud = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

function fail(message) {
    console.error(`\nRelease stopped: ${message}\n`);
    process.exit(1);
}

const pkgPath = join(root, 'package.json');
const pkgRaw = readFileSync(pkgPath, 'utf-8');
const pkg = JSON.parse(pkgRaw);

const requested = process.argv[2];
if (!requested) {
    fail('give a version (2.7.8) or a bump (patch, minor, major).');
}

const next = (() => {
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    if (requested === 'major') return `${major + 1}.0.0`;
    if (requested === 'minor') return `${major}.${minor + 1}.0`;
    if (requested === 'patch') return `${major}.${minor}.${patch + 1}`;
    if (!/^\d+\.\d+\.\d+$/.test(requested)) fail(`"${requested}" is not a version or a bump.`);
    // An explicit version must move forward: publishing a downgrade or the
    // current version again would fail at npm anyway, but late and messily.
    const toParts = (v) => v.split('.').map(Number);
    const [ca, cb, cc] = toParts(pkg.version);
    const [na, nb, nc] = toParts(requested);
    const forward = na > ca || (na === ca && (nb > cb || (nb === cb && nc > cc)));
    if (!forward) {
        fail(`"${requested}" is not higher than the current version ${pkg.version}.`);
    }
    return requested;
})();

// --- refuse early, while nothing has happened yet ---

if (run('git', ['status', '--porcelain'])) {
    fail('the working tree has uncommitted changes. Commit them first.');
}
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
    fail(`on branch ${branch}, not main.`);
}
if (run('git', ['tag', '--list', `v${next}`])) {
    fail(`tag v${next} already exists.`);
}

// The push at the end must be all-or-nothing, and it can only be that if the
// branch update is a fast-forward. Git happily accepts a tag while rejecting a
// stale main in the same push, and that half-success triggers the release
// workflow on a tree origin/main does not contain. So: sync with the remote
// now, refuse a stale or diverged main, refuse a tag the remote already has.
run('git', ['fetch', 'origin', 'main']);
try {
    run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
} catch {
    fail('local main is behind or diverged from origin/main. Pull first.');
}
try {
    if (run('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${next}`])) {
        fail(`tag v${next} already exists on origin.`);
    }
} catch (error) {
    fail(`cannot reach origin to verify tags: ${error.message ?? error}`);
}

// The check that would have caught a real mistake: a version published with
// nothing written about it.
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8');
// Escape the dots in the version (2.8.0 -> 2\.8\.0) so they match literally,
// and end the section at the next "## " heading or the end of the file. The old
// pattern escaped a backslash-then-any-char that never occurs in a version, so
// the dots stayed wildcards, and it terminated on \Z, which JS regex does not
// support (it matched a literal "Z"), so the final CHANGELOG entry never matched.
const section = changelog.match(
    new RegExp(`^## ${next.replace(/\./g, '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'),
);
if (!section) {
    fail(`CHANGELOG.md has no "## ${next}" section. Write what changed before releasing it.`);
}
const notes = section[1].trim();
if (notes.length < 20) {
    fail(`the CHANGELOG entry for ${next} is empty. Say what changed.`);
}

console.log(`Releasing ${pkg.name} ${pkg.version} -> ${next}\n`);
runLoud('pnpm', ['lint']);
runLoud('pnpm', ['typecheck']);
runLoud('pnpm', ['test']);
runLoud('pnpm', ['build']);

// --- from here on it is real ---

writeFileSync(pkgPath, pkgRaw.replace(`"version": "${pkg.version}"`, `"version": "${next}"`));
// Stamp the new version into the skill launchers and runtime.md, so the pinned
// version can never drift from package.json. The commit below picks them up.
stampLaunchers(root);
run('git', ['commit', '-am', `chore(release): v${next}`]);
run('git', ['tag', '-a', `v${next}`, '-m', `v${next}`]);
// --atomic: the branch and the tag land together or not at all. The old
// --follow-tags push could deliver the tag while main was rejected as
// non-fast-forward, releasing a tree the remote branch never contained.
run('git', ['push', '--atomic', 'origin', 'main', `refs/tags/v${next}`]);

console.log(
    `\nTag v${next} pushed. CI will finish the release: npm publish and the GitHub Release.`,
);
console.log('Watch it: gh run watch, or https://github.com/liustack/modlens/actions');
