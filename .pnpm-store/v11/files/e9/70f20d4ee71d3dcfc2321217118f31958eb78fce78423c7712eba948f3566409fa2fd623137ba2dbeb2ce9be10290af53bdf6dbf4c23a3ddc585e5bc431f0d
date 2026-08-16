import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

// The leak this pins: runCommand's SIGKILL escalation timer used to be
// unref'd, so in a standalone CLI (whose event loop drains right after the
// timeout settles) it never fired, and a SIGTERM-ignoring provider outlived
// its parent indefinitely. The in-process analyzer tests cannot catch that —
// vitest's own timers keep the loop alive and the escalation runs anyway —
// so this drives the real runCommand from a genuinely independent parent
// process (src/analyzer.leak.parent.mjs) and asserts the child is gone once
// the parent has exited.
const PARENT = fileURLToPath(new URL('./analyzer.leak.parent.mjs', import.meta.url));

function processAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

describe('provider subprocess lifecycle from an independent parent', () => {
    let dir: string;

    afterEach(() => {
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('a SIGTERM-ignoring provider is SIGKILLed before the CLI process exits', {
        timeout: 20_000,
    }, async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-leak-'));
        const pidFile = path.join(dir, 'child.pid');
        const parent = spawn(process.execPath, [PARENT, pidFile], { stdio: 'ignore' });
        const exitCode = await new Promise<number | null>((resolve) => {
            parent.on('exit', resolve);
        });
        expect(exitCode).toBe(0);

        // The child must have started (pid file written at spawn) and be
        // dead shortly after the parent left. The small poll absorbs the
        // OS actually reaping the SIGKILLed process.
        const pid = Number(fs.readFileSync(pidFile, 'utf-8'));
        expect(pid).toBeGreaterThan(0);
        const deadline = Date.now() + 5_000;
        while (processAlive(pid) && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const alive = processAlive(pid);
        if (alive) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // best-effort cleanup of the leaked child before failing
            }
        }
        expect(alive).toBe(false);
    });
});
