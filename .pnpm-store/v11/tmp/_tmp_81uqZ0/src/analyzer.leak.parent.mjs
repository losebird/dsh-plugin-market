// Independent parent for the subprocess-leak regression test. It must be a
// REAL separate process: inside vitest, the test runner's own timers keep the
// event loop alive and hide exactly the bug this exists to catch (an unref'd
// SIGKILL escalation timer dying with the parent's event loop, leaving a
// SIGTERM-ignoring provider running forever).
//
// Runs the real runCommand against a stubborn child that writes its pid to
// process.argv[2] and ignores SIGTERM, with a short timeout. The expected
// lifecycle: timeout -> SIGTERM (ignored) -> ref'd grace timer -> SIGKILL ->
// child exit -> this process drains and exits. The test then asserts the
// child pid is gone once this parent has left.
import { runCommand } from './analyzer.ts';

const pidFile = process.argv[2];
if (!pidFile) {
    console.error('usage: node analyzer.leak.parent.mjs <pid-file>');
    process.exit(2);
}

const stubborn = [
    '-e',
    "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);",
    pidFile,
];

runCommand(
    'stubborn',
    { command: process.execPath, args: stubborn, cwd: process.cwd() },
    500,
).catch(() => {
    // The timeout rejection is the expected outcome; the assertion under test
    // is what happens to the child after this process exits.
});
