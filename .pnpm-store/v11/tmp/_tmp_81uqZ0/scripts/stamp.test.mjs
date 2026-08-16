import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    docTargets,
    readPackageVersion,
    readStampedVersions,
    repoRoot,
    stampTargets,
    unpinnedInstalls,
} from './stamp.mjs';

// Every file git tracks. An extension allowlist is a losing game: a stale
// install command reads the same in a .mdx, an .adoc, or a JSON manifest, and
// the file type that gets added next is the one nobody updated the list for.
// Binary blobs are skipped by extension, since only those can be misread.
const BINARY = /\.(png|jpe?g|gif|webp|heic|heif|ico|pdf|zip|gz|woff2?|ttf)$/i;

function trackedFiles(root) {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf-8' })
        .split('\0')
        .filter((name) => name !== '' && !BINARY.test(name))
        .map((name) => join(root, name));
}

describe('launcher version stamping', () => {
    it('keeps the launchers and every doc install command pinned to the package version', () => {
        const version = readPackageVersion();
        for (const stamped of readStampedVersions()) {
            expect(stamped.version, `${stamped.name} is not stamped to ${version}`).toBe(version);
        }
    });

    it('pins every install command in every tracked file', () => {
        const offenders = [];
        for (const file of trackedFiles(repoRoot)) {
            // This file's own table of bad forms is the fixture below, not a
            // command anyone would run. Matched by exact path: a suffix test
            // would also excuse any other file ending in the same name.
            if (file === join(repoRoot, 'scripts', 'stamp.test.mjs')) continue;
            for (const command of unpinnedInstalls(readFileSync(file, 'utf-8'))) {
                offenders.push(`${file}: ${command}`);
            }
        }
        expect(offenders, 'these install whatever survived the release-age gate').toEqual([]);
    });

    it('recognizes every shape of an unpinned install', () => {
        // The rules themselves, pinned. Reviewing this check by hand is how
        // eight different ways of writing an unpinned install got past it,
        // most of them ordinary shell prose rather than exotic syntax.
        const unpinned = [
            'add @liustack/modlens@latest',
            "add '@liustack/modlens@latest'",
            'add "@liustack/modlens@latest"',
            'add  @liustack/modlens@latest',
            'add @liustack/modlens',
            'add @liustack/modlens@^3.16.0',
            'add @liustack/modlens@next',
            'add @liustack/modlens@3',
            'add @liustack/modlens@3.16.4+local',
            'add @liustack/modlens@$VERSION',
            'pnpm add --save-prod @liustack/modlens@latest',
            // The flag belongs to some other command, or to no command.
            'add @liustack/modlens@1.2.3 --config.minimumReleaseAge=0 | add @liustack/modlens@latest',
            'pnpm add @liustack/modlens@latest && printf %s --config.minimumReleaseAge=0',
            'pnpm add @liustack/modlens@latest; printf %s --config.minimumReleaseAge=0',
            'pnpm add @liustack/modlens@latest | echo --config.minimumReleaseAge=0',
            'pnpm add @liustack/modlens@latest # use --config.minimumReleaseAge=0 if you must',
            // The spec travels in a variable.
            'PKG=@liustack/modlens@latest; pnpm add "$PKG"',
            "pnpm add $'@liustack/modlens@latest'",
            // The flag is a background-command argument, a redirection
            // target, and a variable's value: none of them lift anything.
            'pnpm add @liustack/modlens@latest & printf %s --config.minimumReleaseAge=0',
            'pnpm add @liustack/modlens@latest > --config.minimumReleaseAge=0',
            'FLAG=--config.minimumReleaseAge=0 pnpm add @liustack/modlens@latest',
            // An exact spec must not vouch for a bare mention beside it.
            'pnpm add @liustack/modlens@1.2.3 @liustack/modlens',
            // Only <pinned> and <version> read as placeholders.
            'pnpm add @liustack/modlens@<anything>',
            // The flag has to be the exact argument, standing on its own.
            'pnpm add @liustack/modlens@latest --config.minimumReleaseAge=0oops',
            'pnpm add @liustack/modlens@latest --registry=--config.minimumReleaseAge=0',
            'pnpm add @liustack/modlens@latest, or pass "--config.minimumReleaseAge=0"',
            // The one-letter install verb installs just the same.
            'pnpm i @liustack/modlens',
            'npm i @liustack/modlens@latest',
        ];
        for (const command of unpinned) {
            expect(unpinnedInstalls(command), command).not.toEqual([]);
        }

        // Two commands on one row: the offender is the one without the flag.
        expect(
            unpinnedInstalls(
                'add @liustack/modlens@1.2.3 --config.minimumReleaseAge=0 | add @liustack/modlens@latest',
            ),
        ).toEqual(['add @liustack/modlens@latest']);

        const fine = [
            'add @liustack/modlens@1.2.3',
            'add @liustack/modlens@latest --config.minimumReleaseAge=0',
            'npx --yes --package @liustack/modlens@1.2.3 modlens',
            'the `@latest` tag does not skip the gate',
            'installed with @liustack/modlens as the package name',
            // Prose, not an install: the lone `i` here is part of "i.e.".
            'the bundle, i.e. @liustack/modlens, ships its own engine',
            // A placeholder describing a command's shape, not a command.
            'npx --yes --package @liustack/modlens@<pinned> modlens <args>',
            'bunx --bun @liustack/modlens@<version> <args>',
        ];
        for (const command of fine) {
            expect(unpinnedInstalls(command), command).toEqual([]);
        }
    });

    it('joins a continuation before judging the command it belongs to', () => {
        // Without the join, the flag sits on a line of its own and the
        // install above it reads as unlifted: a false positive, which is the
        // failure this fixture has to produce if the join is ever dropped.
        const lifted = 'pnpm add @liustack/modlens@latest \\\n  --config.minimumReleaseAge=0';
        expect(unpinnedInstalls(lifted)).toEqual([]);
        // CRLF is the same command, so it has to reach the same verdict.
        expect(unpinnedInstalls(lifted.replace(/\n/g, '\r\n'))).toEqual([]);
        // And a continuation must not become a way to hide an unpinned one.
        expect(unpinnedInstalls('pnpm add \\\n  @liustack/modlens@latest')).not.toEqual([]);
    });

    it('rewrites only the version value and leaves the line shape intact', () => {
        for (const target of [
            ...stampTargets('/base', '@scope/pkg'),
            ...docTargets('/base', '@scope/pkg'),
        ]) {
            const original = target.format('0.0.0');
            const restamped = original.replace(target.pattern, target.format('9.9.9'));
            expect(restamped).toBe(target.format('9.9.9'));
            expect(restamped).not.toBe(original);
        }
    });
});
