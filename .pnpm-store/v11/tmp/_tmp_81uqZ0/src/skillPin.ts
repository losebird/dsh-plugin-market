// An installed skill is a COPY. Its launcher carries the version it was
// stamped with, and that copy never follows later npm releases: a user who
// installed once keeps running the install-time version until someone
// overwrites the folder, which is how a machine sat on 3.8.0 for eight
// releases and hit bugs that were long fixed (issue #33).
//
// Nothing here reaches the network. The check is a comparison between the
// pin inside each installed copy and the version of the CLI doing the
// reporting, which is meaningful exactly when they differ: a copy is frozen at
// install time while the CLI reporting is whatever was just launched, so a
// stale copy shows up the moment the user asks for a health check.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Where each harness reads global skills from (mirrors INSTALL.md). */
const SKILL_DIRS = [
    ['claude-code', '.claude/skills'],
    ['codex', '.codex/skills'],
    ['pi/opencode', '.agents/skills'],
    ['dsh', '.dsh/skills'],
] as const;

export interface SkillInstall {
    /** Which harness directory it was found in. */
    harness: string;
    /** The launcher file the pin was read from. */
    path: string;
    /** The version that copy pins, or null when the launcher is unreadable. */
    pinned: string | null;
    /** True when the pin is older than the CLI reporting it. */
    outdated: boolean;
}

/** Compare two dotted versions; missing or unparsable sorts as older. */
function isOlder(pinned: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const [pa, pb, pc] = parse(pinned);
    const [ca, cb, cc] = parse(current);
    if (pa !== ca) return pa < ca;
    if (pb !== cb) return pb < cb;
    return pc < cc;
}

/** Read `PINNED="x.y.z"` out of a POSIX launcher's text. */
export function readPinnedVersion(launcher: string): string | null {
    return /^PINNED="([^"]+)"/m.exec(launcher)?.[1] ?? null;
}

/**
 * Every installed skill copy this machine has, with the pin each one carries.
 * `currentVersion` is the version of the CLI asking, so a copy older than it
 * is reported as outdated.
 */
export function findSkillInstalls(
    currentVersion: string,
    home: string = os.homedir(),
    skillName = 'modlens',
): SkillInstall[] {
    const installs: SkillInstall[] = [];
    for (const [harness, relative] of SKILL_DIRS) {
        const launcher = path.join(home, relative, skillName, 'scripts', 'run.sh');
        let text: string;
        try {
            text = fs.readFileSync(launcher, 'utf-8');
        } catch {
            continue;
        }
        const pinned = readPinnedVersion(text);
        installs.push({
            harness,
            path: launcher,
            pinned,
            outdated: pinned !== null && isOlder(pinned, currentVersion),
        });
    }
    return installs;
}
