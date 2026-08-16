import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { findSkillInstalls, readPinnedVersion } from './skillPin.ts';

const homes: string[] = [];
afterEach(() => {
    while (homes.length > 0) {
        fs.rmSync(homes.pop() as string, { recursive: true, force: true });
    }
});

/** A fake home with skill copies installed at the given pins. */
function homeWith(copies: Record<string, string | null>): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-skillpin-'));
    homes.push(home);
    for (const [relative, pin] of Object.entries(copies)) {
        const dir = path.join(home, relative, 'modlens', 'scripts');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'run.sh'),
            pin === null ? '#!/bin/sh\necho no pin here\n' : `#!/bin/sh\nPINNED="${pin}"\n`,
        );
    }
    return home;
}

describe('readPinnedVersion', () => {
    it('reads the launcher pin', () => {
        expect(readPinnedVersion('#!/bin/sh\nPINNED="3.16.1"\n')).toBe('3.16.1');
    });

    it('returns null when the launcher carries no pin', () => {
        expect(readPinnedVersion('#!/bin/sh\necho hi\n')).toBeNull();
    });
});

describe('findSkillInstalls', () => {
    it('flags a copy older than the CLI reporting on it', () => {
        // The exact shape of issue #33: installed at 3.8.0, still running it
        // eight releases later because a copy never follows npm.
        const home = homeWith({ '.claude/skills': '3.8.0' });
        const [install] = findSkillInstalls('3.16.2', home);
        expect(install.harness).toBe('claude-code');
        expect(install.pinned).toBe('3.8.0');
        expect(install.outdated).toBe(true);
    });

    it('leaves a current or newer copy alone', () => {
        const home = homeWith({ '.codex/skills': '3.16.2', '.agents/skills': '3.99.0' });
        for (const install of findSkillInstalls('3.16.2', home)) {
            expect(install.outdated).toBe(false);
        }
    });

    it('compares numerically, not as text', () => {
        // '3.9.0' sorts after '3.16.2' as a string; only the numeric
        // comparison gets this right.
        const home = homeWith({ '.claude/skills': '3.9.0' });
        expect(findSkillInstalls('3.16.2', home)[0].outdated).toBe(true);
    });

    it('reports an unreadable pin without calling it outdated', () => {
        const home = homeWith({ '.claude/skills': null });
        const [install] = findSkillInstalls('3.16.2', home);
        expect(install.pinned).toBeNull();
        expect(install.outdated).toBe(false);
    });

    it('finds every harness directory, and none when nothing is installed', () => {
        const home = homeWith({
            '.claude/skills': '3.8.0',
            '.codex/skills': '3.8.0',
            '.agents/skills': '3.8.0',
            '.dsh/skills': '3.8.0',
        });
        expect(findSkillInstalls('3.16.2', home)).toHaveLength(4);
        expect(findSkillInstalls('3.16.2', homeWith({}))).toEqual([]);
    });
});
