import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

// The hidden prompt only exists on a terminal, and a pipe takes the other
// branch entirely, so the unit tests cannot reach it: readline's keypress
// handling, SIGINT, and the muted echo are all terminal behaviour. These
// drive the real binary under a pty. Python ships with macOS and Linux CI
// images; without it the suite skips rather than pretending to cover this.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'dist', 'main.js');

function hasPython(): boolean {
    const probe = spawnSync('python3', ['-c', 'import pty'], { encoding: 'utf-8' });
    return probe.status === 0;
}

const runnable = process.platform !== 'win32' && hasPython();

const DRIVER = `
import os, pty, sys, time, json, select
cli, home, keys = sys.argv[1], sys.argv[2], sys.argv[3]
env = dict(os.environ, HOME=home, USERPROFILE=home)
pid, fd = pty.fork()
if pid == 0:
    os.execve('/usr/bin/env', ['/usr/bin/env', 'node', cli, 'config', 'set', 'gemini-api.apiKey'], env)
time.sleep(1.0)
os.write(fd, keys.encode())
out = b''
deadline = time.time() + 10
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.3)
    if not r:
        continue
    try:
        chunk = os.read(fd, 1024)
    except OSError:
        break
    if not chunk:
        break
    out += chunk
    if b'Saved' in out or b'Error:' in out:
        break
try:
    os.kill(pid, 9)
except ProcessLookupError:
    pass
os.waitpid(pid, 0)
cfg = os.path.join(home, '.modlens', 'config.json')
print(json.dumps({
    'out': out.decode(errors='replace'),
    'config': json.load(open(cfg)) if os.path.exists(cfg) else None,
}))
`;

function atTerminal(keys: string): {
    out: string;
    config: { providers?: Record<string, { apiKey?: string }> } | null;
} {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'modlens-pty-'));
    try {
        const raw = execFileSync('python3', ['-c', DRIVER, cli, home, keys], {
            encoding: 'utf-8',
            timeout: 30_000,
        });
        return JSON.parse(raw);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
}

describe.skipIf(!runnable)('the hidden prompt on a real terminal', () => {
    beforeAll(() => {
        execFileSync('pnpm', ['build'], { cwd: root, stdio: 'ignore', shell: true });
    }, 180_000);

    it('saves what was typed without ever echoing it', () => {
        const { out, config } = atTerminal('sk-typed-secret\r');
        expect(config?.providers?.['gemini-api']?.apiKey).toBe('sk-typed-secret');
        expect(out).not.toContain('sk-typed-secret');
        expect(out).toContain('input hidden');
    }, 60_000);

    it('cancels on Ctrl+C without saving the half-typed key', () => {
        // The first version left the promise unsettled here: the process died
        // of an unresolved await, exit 13 with a Node warning, and a piped
        // approximation of this even stored the ETX byte as part of the key.
        const { out, config } = atTerminal('sk-half\x03');
        expect(out).toContain('cancelled');
        expect(out).not.toContain('Saved');
        expect(config).toBeNull();
    }, 60_000);

    it('reports EOF instead of hanging or saving an empty key', () => {
        const { out, config } = atTerminal('\x04');
        expect(out).toContain('input ended');
        expect(config).toBeNull();
    }, 60_000);

    it('refuses an empty line', () => {
        const { out, config } = atTerminal('\r');
        expect(out).toContain('no key entered');
        expect(config).toBeNull();
    }, 60_000);
});
