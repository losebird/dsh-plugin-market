// Version stamping for every file that names a version: the skill launchers
// (run.sh, run.ps1, references/runtime.md, the SKILL.md no-script fallback)
// and the install commands printed in the README, INSTALL, and docs.
// `scripts/release.mjs` calls stampLaunchers() at release time so none of them
// can drift from package.json by hand. The drift test (scripts/stamp.test.mjs)
// reads the same files back and asserts they match. Keeping the read and the
// write in one module is what keeps the two in step.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackage(root) {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
}

/** The version this repo currently ships, from package.json. */
export function readPackageVersion(root = repoRoot) {
    return readPackage(root).version;
}

/** The skill directory name, derived from the scoped package name. */
export function skillName(root = repoRoot) {
    return readPackage(root).name.split('/').pop();
}

/**
 * The files that carry the pinned version, each with a pattern that matches
 * one version occurrence and captures just the value in group 1, plus a
 * formatter that rebuilds that text for a given version. One pattern serves
 * both stamping (replace the text) and reading (capture the value).
 */
export function stampTargets(base, pkgName) {
    const skillFile = join(base, 'SKILL.md');
    const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
        {
            name: 'run.sh',
            file: join(base, 'scripts', 'run.sh'),
            pattern: /^PINNED="([^"]*)"$/m,
            format: (version) => `PINNED="${version}"`,
        },
        {
            name: 'run.ps1',
            file: join(base, 'scripts', 'run.ps1'),
            pattern: /^\$Pinned = '([^']*)'$/m,
            format: (version) => `$Pinned = '${version}'`,
        },
        {
            name: 'runtime.md',
            file: join(base, 'references', 'runtime.md'),
            pattern: /^- Pinned CLI version: (.+)$/m,
            format: (version) => `- Pinned CLI version: ${version}`,
        },
        {
            name: 'SKILL.md pinned prose',
            file: skillFile,
            pattern: /the pinned version is (\d+\.\d+\.\d+)/,
            format: (version) => `the pinned version is ${version}`,
        },
        {
            name: 'SKILL.md PATH rule',
            file: skillFile,
            pattern: /major version is \d+ and is at least (\d+\.\d+\.\d+)/,
            format: (version) =>
                `major version is ${version.split('.')[0]} and is at least ${version}`,
        },
        {
            name: 'SKILL.md npx pin',
            file: skillFile,
            pattern: new RegExp(`npx --yes --package ${escaped}@(\\d+\\.\\d+\\.\\d+)`),
            format: (version) => `npx --yes --package ${pkgName}@${version}`,
        },
        {
            name: 'SKILL.md bunx pin',
            file: skillFile,
            pattern: new RegExp(`bunx --bun ${escaped}@(\\d+\\.\\d+\\.\\d+)`),
            format: (version) => `bunx --bun ${pkgName}@${version}`,
        },
    ];
}

/**
 * The install commands in the docs carry the version too, and they cannot use
 * `@latest`. pnpm 11 holds back releases published in the last 24 hours and
 * resolves the dist-tag against what survives that filter, so `@latest` hands
 * a new reader whatever shipped a day ago: measured at 3.10.0 on a day when
 * 3.16.4 was current, twenty releases and several bug fixes behind. A named
 * version is a deliberate request and installs. Stamping is what makes pinning
 * affordable, since the number is rewritten at release time rather than by
 * hand.
 */
export function docTargets(root, pkgName) {
    const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
        'README.md',
        'README.zh-CN.md',
        'INSTALL.md',
        join('docs', 'harness-setup.md'),
        join('docs', 'harness-setup.zh-CN.md'),
        join('docs', 'troubleshooting.md'),
        join('docs', 'troubleshooting.zh-CN.md'),
    ].map((relative) => ({
        name: `${relative} install pin`,
        file: join(root, relative),
        // Only an already-pinned spec. The one deliberate `@latest` left in
        // the docs sits next to --config.minimumReleaseAge=0, where the gate
        // is lifted and the tag does resolve to the newest release.
        pattern: new RegExp(`${escaped}@(\\d+\\.\\d+\\.\\d+)`, 'g'),
        format: (version) => `${pkgName}@${version}`,
    }));
}

/** Every file carrying the version: skill launchers and doc install commands. */
export function allTargets(root = repoRoot) {
    const pkg = readPackage(root);
    return [
        ...stampTargets(join(root, 'skills', skillName(root)), pkg.name),
        ...docTargets(root, pkg.name),
    ];
}

/** The same pattern, guaranteed global, so every occurrence is seen. */
function everyMatch(pattern) {
    return pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
}

/** Rewrite every version occurrence in those files to the package version. */
export function stampLaunchers(root = repoRoot) {
    const version = readPackageVersion(root);
    const stamped = [];
    for (const target of allTargets(root)) {
        const before = readFileSync(target.file, 'utf-8');
        if (before.match(everyMatch(target.pattern)) === null) {
            throw new Error(`No version line to stamp in ${target.file}`);
        }
        const after = before.replace(everyMatch(target.pattern), target.format(version));
        if (after !== before) {
            writeFileSync(target.file, after);
        }
        stamped.push(target.name);
    }
    return { version, stamped };
}

/**
 * The version written at every occurrence, one entry each: a file carrying
 * two install commands can drift in only one of them.
 */
export function readStampedVersions(root = repoRoot) {
    const entries = [];
    for (const target of allTargets(root)) {
        const matches = [
            ...readFileSync(target.file, 'utf-8').matchAll(everyMatch(target.pattern)),
        ];
        if (matches.length === 0) {
            entries.push({ name: target.name, file: target.file, version: null });
            continue;
        }
        for (const [index, match] of matches.entries()) {
            const name = matches.length > 1 ? `${target.name} #${index + 1}` : target.name;
            entries.push({ name, file: target.file, version: match[1] });
        }
    }
    return entries;
}

/**
 * Every install command in `text` that cannot be proven to install the version
 * this repo ships. pnpm 11 holds back releases published in the last 24 hours
 * and resolves a tag against what survives, so only an exact x.y.z installs
 * the current one, and only a command that lifts the gate itself may ask for
 * a tag.
 *
 * Proven, not searched for: a regex slice between two package mentions is not
 * a shell command, so a gate-lifting flag in a comment, in a piped command, or
 * after a `&&` could clear an install that never carried it. Text is split
 * into segments at the separators that actually end a command, comments are
 * removed first, and anything left holding the package without a provable
 * exact pin is reported rather than assumed fine. Exported so the rules are
 * testable directly: reviewing this check by hand is how eight ways of
 * writing an unpinned install got past earlier versions of it.
 */
export function unpinnedInstalls(text, pkgName = '@liustack/modlens') {
    const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A spec runs to the first character that cannot be part of one. The
    // exactness test is anchored so `3.16.4+local` and `3` both fail it.
    const spec = new RegExp(`${escaped}@([^\\s\`'";|&#)]*)`, 'g');
    // `add` and `install` anywhere (dsh forwards its own `add` to pnpm), plus
    // the one-letter form, which only counts right after a package manager:
    // a bare \bi\b would match the `i` in "i.e." and report ordinary prose.
    const bare = new RegExp(
        `(\\b(add|install)\\b|\\b(pnpm|npm|yarn|bun)\\s+i\\b)[^\\n]*?${escaped}(?![\\w./@-])`,
    );
    const found = [];
    // CRLF first, so a continuation ending in \r\n joins like any other.
    const joined = text.replace(/\r\n/g, '\n').replace(/\\\n\s*/g, ' ');
    for (const line of joined.split('\n')) {
        // A comment cannot lift anything, and it cannot be an install either.
        const code = line.replace(/(^|\s)#.*$/, '');
        // `&` ends a command too, not only `&&`.
        for (const segment of code.split(/&&|\|\||[|;&]/)) {
            if (!segment.includes(pkgName)) continue;
            // The flag counts only as an argument of this command. A
            // redirection target and a variable's value are neither, and both
            // read as the flag to a plain substring search.
            const args = segment
                .replace(/[<>]+\s*\S+/g, ' ')
                .replace(/(^|\s)[A-Za-z_][A-Za-z0-9_]*=\S+/g, ' ');
            // The exact argument, standing alone: `=0oops` is a different
            // value, and the flag quoted inside prose is not an argument.
            if (/(^|\s)--config\.minimumReleaseAge=0(\s|$)/.test(args)) continue;
            const specs = [...segment.matchAll(spec)]
                .map((match) => match[1])
                // `@<pinned>` and `@<version>` are placeholders in prose
                // describing the shape of a command, not commands: nobody can
                // run them, so they cannot install a stale version either.
                // Only those two spellings, so the brackets are not a way out.
                .filter((value) => !/^<(pinned|version)>$/.test(value));
            const unpinned = specs.filter((value) => !/^\d+\.\d+\.\d+$/.test(value));
            // The bare-package test runs on its own: an exact spec elsewhere
            // in the same command must not vouch for a second, spec-less
            // mention of the package.
            if (unpinned.length > 0 || bare.test(segment)) {
                found.push(segment.trim());
            }
        }
    }
    return found;
}
