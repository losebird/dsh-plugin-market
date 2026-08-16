import { describe, expect, it } from 'vitest';
import { parseCmdShimTarget, resolveSpawnPlan } from './winExec.ts';

// Every fixture below is the verbatim output of a real shim generator, run
// against a real file: npm's cmd-shim@9 and pnpm's @zkochan/cmd-shim@9. The
// interpreter must be read out of the shim, never guessed from the entry's
// extension — cmd-shim happily generates a python shim for a file named .js.

/** npm, `#!/usr/bin/env node`. */
const NPM_NODE = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\..\\cli.js" %*`;

/** npm, `#!/usr/bin/env node --max-old-space-size=4096 --no-warnings`. */
const NPM_NODE_FLAGS = NPM_NODE.replace(
    '"%_prog%"  "%dp0%\\..\\cli.js" %*',
    '"%_prog%" --max-old-space-size=4096 --no-warnings "%dp0%\\..\\cli-flags.js" %*',
);

/** npm, `#!/usr/bin/env python`, entry named .js — the trap. */
const NPM_PYTHON_JS = NPM_NODE.replaceAll('node.exe', 'python.exe')
    .replace('SET "_prog=node"', 'SET "_prog=python"')
    .replace('"%dp0%\\..\\cli.js"', '"%dp0%\\..\\python-named.js"');

/** npm, a Node bin with no file extension at all. */
const NPM_NODE_NOEXT = NPM_NODE.replace('"%dp0%\\..\\cli.js"', '"%dp0%\\..\\entry-noext"');

/** npm, `#!/usr/bin/env FOO=bar node`: carries an env assignment. */
const NPM_NODE_ENV_KV = NPM_NODE.replace('CALL :find_dp0\n', 'CALL :find_dp0\n@SET FOO=bar\n');

/** pnpm, standard. */
const PNPM_NODE = `@SETLOCAL
@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\..\\cli.js" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\..\\cli.js" %*
)`;

/** pnpm with nodePath: prepends NODE_PATH, which a direct spawn would drop. */
const PNPM_NODEPATH = `@SETLOCAL
@IF NOT DEFINED NODE_PATH (
  @SET "NODE_PATH=C;\\extra modules"
) ELSE (
  @SET "NODE_PATH=C;\\extra modules;%NODE_PATH%"
)
@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\..\\cli.js" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\..\\cli.js" %*
)`;

/** pnpm with nodeExecPath: pins one Node binary. */
const PNPM_NODEEXEC = `@SETLOCAL
@"C:\\runtimes\\node20\\node.exe"  "%~dp0\\..\\cli.js" %*`;

/** npm, a shebang whose flag value is itself a shim-relative path. */
const NPM_DP0_FLAG = NPM_NODE.replace(
    '"%_prog%"  "%dp0%\\..\\cli.js" %*',
    '"%_prog%" --require "%dp0%\\..\\preload.cjs" "%dp0%\\..\\cli.js" %*',
);

/** pnpm progArgs holding a shim-relative path, which cmd would expand. */
const PNPM_DP0_PROGARG = PNPM_NODE.replaceAll(
    '"%~dp0\\..\\cli.js" %*',
    '"%~dp0\\..\\cli.js" --config "%~dp0\\..\\config.json" %*',
);

/** pnpm across drives: path.relative gives an absolute entry, no %dp0% at all. */
const PNPM_CROSS_DRIVE = '@SETLOCAL\r\n@node  "D:\\provider\\cli.js" %*\r\n';

/** npm, `#!/usr/bin/env node --require ./preload.cjs`: a flag with a separate value. */
const NPM_SPACED_FLAG = NPM_NODE.replace(
    '"%_prog%"  "%dp0%\\..\\cli.js" %*',
    '"%_prog%" --require ./preload.cjs "%dp0%\\..\\spaced.js" %*',
);

/** pnpm with progArgs: fixed program arguments, after the entry. */
const PNPM_PROGARGS = PNPM_NODE.replaceAll(
    '"%~dp0\\..\\cli.js" %*',
    '"%~dp0\\..\\cli.js" --fixed-one fixed-value %*',
);

describe('parseCmdShimTarget', () => {
    it('reads npm Node shims, resolving the entry against the shim directory', () => {
        const target = parseCmdShimTarget('C:\\npm\\bin\\claude.cmd', NPM_NODE);
        expect(target?.args).toEqual(['C:\\npm\\cli.js']);
        expect(target?.nodeExec).toBeUndefined();
    });

    it('keeps the interpreter flags a shebang injected, in order', () => {
        const target = parseCmdShimTarget('C:\\npm\\bin\\x.cmd', NPM_NODE_FLAGS);
        expect(target?.args).toEqual([
            '--max-old-space-size=4096',
            '--no-warnings',
            'C:\\npm\\cli-flags.js',
        ]);
    });

    it('declines a python shim whose entry is named .js', () => {
        // The extension is not evidence of the interpreter: running this
        // under Node would execute a Python program as JavaScript.
        expect(parseCmdShimTarget('C:\\npm\\bin\\tool.cmd', NPM_PYTHON_JS)).toBeNull();
    });

    it('accepts a Node bin with no file extension', () => {
        const target = parseCmdShimTarget('C:\\npm\\bin\\tool.cmd', NPM_NODE_NOEXT);
        expect(target?.args).toEqual(['C:\\npm\\entry-noext']);
    });

    it('declines a shim carrying an environment assignment', () => {
        // `env FOO=bar node` renders as @SET FOO=bar; a direct spawn would
        // silently drop it, so the shim is left to the fallback instead.
        expect(parseCmdShimTarget('C:\\npm\\bin\\kv.cmd', NPM_NODE_ENV_KV)).toBeNull();
    });

    it('reads pnpm shims, and declines the NODE_PATH variant', () => {
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\tool.cmd', PNPM_NODE)?.args).toEqual([
            'C:\\pnpm\\cli.js',
        ]);
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\tool.cmd', PNPM_NODEPATH)).toBeNull();
    });

    it('honours a pinned Node binary instead of the running one', () => {
        const target = parseCmdShimTarget('C:\\pnpm\\bin\\tool.cmd', PNPM_NODEEXEC);
        expect(target?.args).toEqual(['C:\\pnpm\\cli.js']);
        expect(target?.nodeExec).toBe('C:\\runtimes\\node20\\node.exe');
    });

    it('keeps a flag value that sits in its own token', () => {
        // `--require ./preload.cjs` is two tokens: dropping the value and
        // sliding the entry into its place ran the wrong file.
        const target = parseCmdShimTarget('C:\\npm\\bin\\x.cmd', NPM_SPACED_FLAG);
        expect(target?.args).toEqual(['--require', './preload.cjs', 'C:\\npm\\spaced.js']);
    });

    it('keeps fixed program arguments that sit after the entry', () => {
        // cmd-shim's progArgs land behind the entry, and they belong ahead of
        // whatever the caller passes.
        const target = parseCmdShimTarget('C:\\pnpm\\bin\\tool.cmd', PNPM_PROGARGS);
        expect(target?.args).toEqual(['C:\\pnpm\\cli.js', '--fixed-one', 'fixed-value']);
    });

    it('expands the shim-directory variable wherever it appears, not just on the entry', () => {
        // cmd substitutes %dp0% in every token it passes. A flag value and a
        // fixed argument can both be shim-relative paths, and handing Node a
        // literal %dp0% would point it at nothing.
        expect(parseCmdShimTarget('C:\\npm\\bin\\x.cmd', NPM_DP0_FLAG)?.args).toEqual([
            '--require',
            'C:\\npm\\preload.cjs',
            'C:\\npm\\cli.js',
        ]);
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', PNPM_DP0_PROGARG)?.args).toEqual([
            'C:\\pnpm\\cli.js',
            '--config',
            'C:\\pnpm\\config.json',
        ]);
    });

    it('handles an absolute entry with no shim-directory reference at all', () => {
        // pnpm writes one when the shim and the package sit on different
        // drives, since path.relative cannot bridge them.
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', PNPM_CROSS_DRIVE)?.args).toEqual([
            'D:\\provider\\cli.js',
        ]);
    });

    it('declines tokens wearing cmd syntax whose meaning it cannot prove', () => {
        // Reproducing cmd's parser is not on the table, so quoting inside a
        // token, a caret escape, and batch's positional parameters each make
        // the shim undecidable. Declining sends the caller to a nameable
        // spawn error instead of an argv that might differ from the real one.
        const withFixed = (fixed: string) =>
            PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', `"%~dp0\\..\\cli.js" ${fixed} %*`);
        for (const fixed of [
            '--label="two words"',
            '--json="{\\"k\\":1}"',
            '--config="%~dp0\\..\\c.json"',
            'fixed^&value',
            '%1',
            '%~1',
            '--home %dp0x%\\x',
        ]) {
            expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed(fixed)), fixed).toBeNull();
        }
    });

    it('declines unquoted cmd control characters, keeps them literal inside quotes', () => {
        // Unquoted, `&` ends the command: the text after it never reaches the
        // program as an argument. Inside quotes it is an ordinary character,
        // which is how any generator writes a path holding one.
        const withFixed = (fixed: string) =>
            PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', `"%~dp0\\..\\cli.js" ${fixed} %*`);
        for (const fixed of [
            'fixed&value',
            'fixed&&value',
            'fixed|value',
            'fixed>capture.txt',
            'fixed<input.txt',
        ]) {
            expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed(fixed)), fixed).toBeNull();
        }
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('"R&D value"'))?.args).toEqual([
            'C:\\pnpm\\cli.js',
            'R&D value',
        ]);
    });

    it('keeps a quoted run glued to the text touching it, and declines the pair', () => {
        // `"quoted"suffix` is ONE argument to Windows. Pulling the quoted half
        // out would hand the program two, so the whole argument is refused.
        const withFixed = (fixed: string) =>
            PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', `"%~dp0\\..\\cli.js" ${fixed} %*`);
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('"quoted"suffix'))).toBeNull();
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('prefix"quoted"'))).toBeNull();
        // A flag whose value is quoted is one argument too, and equally
        // unprovable, rather than two half-tokens.
        expect(
            parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('--label="two words"')),
        ).toBeNull();
    });

    it('requires the forwarder to be the last thing on the line', () => {
        // A token after `%*` is passed AFTER the caller's arguments, which
        // appending them at the end cannot reproduce.
        for (const line of [
            '@node "%~dp0\\..\\cli.js" %* trailing',
            '@node "%~dp0\\..\\cli.js" %* "%*"',
        ]) {
            expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', `${line}\r\n`), line).toBeNull();
        }
    });

    it('declines a line it could not read end to end', () => {
        // An unpaired quote makes the argument pattern skip past it, and the
        // text after would be read as separate arguments while cmd keeps them
        // in one quoted run. Leftover characters mean the line was not
        // understood.
        const withFixed = (fixed: string) =>
            PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', `"%~dp0\\..\\cli.js" ${fixed} %*`);
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('"two words'))).toBeNull();
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('"'))).toBeNull();
    });

    it('declines unquoted parentheses, which open and close the template blocks', () => {
        const withFixed = (fixed: string) =>
            PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', `"%~dp0\\..\\cli.js" ${fixed} %*`);
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('fixed)value'))).toBeNull();
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withFixed('fixed(value'))).toBeNull();
    });

    it('declines a branch that runs the program without forwarding at all', () => {
        // Reading only the lines that forward arguments would approve this
        // shim for something the other branch does not do.
        const branches = [
            '@IF EXIST "%~dp0\\node.exe" (',
            '  "%~dp0\\node.exe" "%~dp0\\..\\cli.js" %*',
            ') ELSE (',
            '  node "%~dp0\\..\\cli.js" fixed-only',
            ')',
        ].join('\r\n');
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', branches)).toBeNull();
    });

    it('declines a file carrying a line it does not recognize at all', () => {
        const extra = `${PNPM_NODE}\r\n@del /q "%~dp0\\..\\cli.js"`;
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', extra)).toBeNull();
    });

    it('declines when one execution branch is unprovable, even if another is fine', () => {
        // The machine picks the branch, not the parser: proving the ELSE while
        // the IF forwards twice would leave the taken path unchecked.
        const branches = [
            '@IF EXIST "%~dp0\\node.exe" (',
            '  "%~dp0\\node.exe" "%~dp0\\..\\cli.js" %* %*',
            ') ELSE (',
            '  node "%~dp0\\..\\cli.js" %*',
            ')',
        ].join('\r\n');
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', branches)).toBeNull();
    });

    it('declines a line that forwards the caller arguments more than once', () => {
        // `node <entry> %* %*` passes each caller argument twice; appending
        // them once is a different argv, so the shim is not reproducible.
        const twice = PNPM_NODE.replaceAll('"%~dp0\\..\\cli.js" %*', '"%~dp0\\..\\cli.js" %* %*');
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', twice)).toBeNull();
    });

    it('declines a token carrying an environment variable it cannot expand', () => {
        const withEnvVar = PNPM_NODE.replaceAll(
            '"%~dp0\\..\\cli.js" %*',
            '"%~dp0\\..\\cli.js" --home "%USERPROFILE%\\x" %*',
        );
        expect(parseCmdShimTarget('C:\\pnpm\\bin\\t.cmd', withEnvVar)).toBeNull();
    });

    it('declines content with no forwarded arguments', () => {
        expect(parseCmdShimTarget('C:\\npm\\x.cmd', '@echo off\nnode cli.js')).toBeNull();
    });
});

describe('resolveSpawnPlan', () => {
    it('passes through untouched off Windows', () => {
        const plan = resolveSpawnPlan('claude', ['-p', 'hello'], { PATH: '/usr/bin' });
        expect(plan).toEqual({ command: 'claude', args: ['-p', 'hello'] });
    });

    // The win32 branch is driven with injected deps so it runs on every
    // platform: a real spawn is not needed to prove the plan is correct.
    const winDeps = (files: Record<string, string>, onPath: Record<string, string>) => ({
        platform: 'win32' as NodeJS.Platform,
        readFileSync: (p: string) => {
            const found = files[p];
            if (found === undefined) throw new Error(`ENOENT ${p}`);
            return found;
        },
        resolveOnPath: (bin: string) => onPath[bin] ?? null,
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
    });

    it('rewrites a bare-name shim to a direct node spawn, multi-line prompt intact', () => {
        const shimPath = 'C:\\npm\\bin\\claude.cmd';
        const prompt = 'line one\nline two & echo not-a-command';
        const plan = resolveSpawnPlan(
            'claude',
            ['-p', prompt],
            { PATH: 'C:\\npm\\bin' },
            winDeps({ [shimPath]: NPM_NODE }, { claude: shimPath }),
        );
        expect(plan.command).toBe('C:\\Program Files\\nodejs\\node.exe');
        expect(plan.args[0]).toBe('C:\\npm\\cli.js');
        // The prompt rides as one argv element: newlines and & survive,
        // because no cmd.exe parses this line.
        expect(plan.args[plan.args.length - 1]).toBe(prompt);
    });

    it('rewrites an absolute --provider-bin .cmd path too', () => {
        const shimPath = 'C:\\tools\\claude.CMD';
        const plan = resolveSpawnPlan(
            shimPath,
            ['-p', 'x'],
            {},
            winDeps({ [shimPath]: NPM_NODE }, {}),
        );
        expect(plan.command).toBe('C:\\Program Files\\nodejs\\node.exe');
        expect(plan.args[0]).toBe('C:\\cli.js');
    });

    it('orders the spawn as node flags, entry, shim args, then the user args', () => {
        const shimPath = 'C:\\pnpm\\bin\\tool.cmd';
        const plan = resolveSpawnPlan(
            'tool',
            ['-p', 'prompt'],
            {},
            winDeps({ [shimPath]: PNPM_PROGARGS }, { tool: shimPath }),
        );
        expect(plan.args).toEqual([
            'C:\\pnpm\\cli.js',
            '--fixed-one',
            'fixed-value',
            '-p',
            'prompt',
        ]);
    });

    it('spawns the pinned Node when the shim names one', () => {
        const shimPath = 'C:\\pnpm\\bin\\tool.cmd';
        const plan = resolveSpawnPlan(
            'tool',
            ['x'],
            {},
            winDeps({ [shimPath]: PNPM_NODEEXEC }, { tool: shimPath }),
        );
        expect(plan.command).toBe('C:\\runtimes\\node20\\node.exe');
    });

    it('leaves a declined shim alone so the spawn error names the command', () => {
        const shimPath = 'C:\\npm\\bin\\tool.cmd';
        for (const content of [NPM_PYTHON_JS, NPM_NODE_ENV_KV, '@echo off\nunrecognized']) {
            const plan = resolveSpawnPlan(
                'tool',
                ['x'],
                {},
                winDeps({ [shimPath]: content }, { tool: shimPath }),
            );
            expect(plan).toEqual({ command: shimPath, args: ['x'] });
        }
    });

    it('passes an unresolvable bare name through so ENOENT still names the CLI', () => {
        const plan = resolveSpawnPlan('missing-cli', ['x'], {}, winDeps({}, {}));
        expect(plan).toEqual({ command: 'missing-cli', args: ['x'] });
    });

    it('passes an .exe straight through', () => {
        const exe = 'C:\\tools\\agy.exe';
        const plan = resolveSpawnPlan(exe, ['-i', 'a.png'], {}, winDeps({}, {}));
        expect(plan).toEqual({ command: exe, args: ['-i', 'a.png'] });
    });
});
