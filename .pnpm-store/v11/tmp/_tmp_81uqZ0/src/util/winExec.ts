// Windows cannot spawn what POSIX can. npm/pnpm/yarn install every JS CLI as
// a trio (a bare-named POSIX sh shim, a .cmd, a .ps1); a bare
// `spawn('claude')` finds none of them (ENOENT, read as "not installed"),
// and handing spawn the .cmd directly hits Node's post-CVE-2024-27980
// refusal to run batch files without a shell (EINVAL) — issue #31.
//
// The obvious fix, wrapping the .cmd in `cmd.exe /d /s /c`, is a trap: cmd's
// command line cannot carry a raw CR or LF, and our provider arguments are
// whole multi-line vision prompts, so a wrapped prompt is truncated at its
// first newline and anything after it is read as a second command. So this
// does not go through a shell at all. A cmd shim's execution line is just
// `<interpreter> [flags] "<entry>" %*`; when the interpreter is Node, the
// entry is read out and Node is spawned on it directly. No shell, no
// escaping, no CRLF hazard, and the child is Node itself, so the caller's
// SIGTERM/SIGKILL lands on the real target.
//
// The parse is deliberately strict about two things, because guessing either
// one runs the user's program wrong: the interpreter is read from the shim
// (never inferred from the entry's extension — cmd-shim happily generates a
// python shim for a file named `.js`), and a shim carrying environment or
// runtime semantics this plan cannot reproduce is declined rather than run
// with those semantics silently dropped.
import * as fs from 'fs';
import * as path from 'path';
import { findOnPath } from '../providers/availability.ts';

export interface SpawnPlan {
    command: string;
    args: string[];
}

export interface CmdShimTarget {
    /**
     * Everything the shim hands Node ahead of the forwarded user arguments,
     * in order, with cmd's own variables expanded. No token is classified as
     * flag, entry, or program argument: reproducing the sequence is what
     * makes the spawn faithful, and every attempt to assign roles had a
     * counterexample a real generator could produce.
     */
    args: string[];
    /** An explicit Node binary the shim pins, when it names an absolute one. */
    nodeExec?: string;
}

interface CmdToken {
    /** The token's text, outer quotes removed. */
    value: string;
    /** Whether cmd saw it inside double quotes, where control characters are literal. */
    quoted: boolean;
}

/**
 * Split one cmd line into whole whitespace-delimited arguments, then classify
 * each. Splitting on whitespace FIRST is what keeps a quoted run and the text
 * touching it in the same argument: `"quoted"suffix` is one argument to
 * Windows, and pulling the quoted half out would hand the program two.
 *
 * An argument that is exactly one quoted run is a quoted token, where cmd
 * treats `&`, `|`, `<`, `>` and `^` as ordinary characters, and where a real
 * generator writes any path containing one. Anything else keeps its text
 * verbatim, so a mixed argument still carries its quotes and is refused as
 * unprovable downstream. The optional `@` is batch's echo-off prefix.
 */
function tokenizeCmdLine(line: string): CmdToken[] | null {
    // Each match is one argument: quoted runs and bare characters glued
    // together until whitespace outside quotes ends it.
    const pattern = /(?:"[^"]*"|[^\s"])+/g;
    const args = line.match(pattern) ?? [];
    // An unpaired quote makes the pattern skip past it, and everything after
    // it would be read as separate arguments while cmd keeps them in one
    // quoted run. Anything the matches did not consume means the line was not
    // understood, so it is not a line to reproduce.
    if (line.replace(pattern, '').trim() !== '') {
        return null;
    }
    return args.map((raw, index) => {
        const text = index === 0 ? raw.replace(/^@/, '') : raw;
        const whole = /^"([^"]*)"$/.exec(text);
        return whole ? { value: whole[1], quoted: true } : { value: text, quoted: false };
    });
}

/** Expand the shim-directory placeholders cmd shims use for their own paths. */
function expandShimPath(token: string, shimDir: string): string | null {
    const relative = /^%~?dp0%?\\?(.*)$/i.exec(token);
    if (relative) {
        return path.win32.join(shimDir, relative[1]);
    }
    if (path.win32.isAbsolute(token)) {
        return token;
    }
    return null;
}

/**
 * cmd syntax whose effect a plain argv element cannot carry, wherever it
 * appears: a quote inside the token (cmd's own grouping, which the OS argv
 * would not contain) and batch's positional parameters, which cmd would
 * substitute from the caller's own arguments.
 */
const CMD_SYNTAX = /"|%~?\d/;

/**
 * The same, for a token cmd did NOT see inside quotes: a caret escapes the
 * next character, `&`, `|`, `<`, `>` end the command and start a
 * conjunction, a pipe, or a redirection, and parentheses open and close the
 * blocks these templates are built from, so none of their text reaches the
 * program as an argument. Inside quotes all of these are ordinary
 * characters, which is how a real generator writes a path holding one.
 */
const CMD_CONTROL = /[\^&|<>()]/;

/**
 * Turn one shim token into the literal string cmd would pass, or null when
 * that cannot be proven. The only substitution performed is cmd's own
 * shim-directory variable, in both spellings, matched with its closing
 * delimiter so a different variable that merely starts with `dp0` is left
 * whole (and then declined below). A surviving `%VAR%` is one cmd would
 * expand from the environment, which a direct spawn cannot.
 */
function literalToken(token: CmdToken, shimDir: string): string | null {
    const text = token.value;
    if (CMD_SYNTAX.test(text) || (!token.quoted && CMD_CONTROL.test(text))) {
        return null;
    }
    const substituted = text.replace(/%dp0%|%~dp0/gi, `${shimDir}\\`);
    if (substituted.includes('%')) {
        return null;
    }
    // A token that IS a path gets normalized for legibility; `..` inside an
    // embedded one resolves at the filesystem either way.
    return /^(%dp0%|%~dp0)/i.test(text) ? path.win32.normalize(substituted) : substituted;
}

/** Whether a resolved interpreter token is Node. */
function isNodeInterpreter(token: string): boolean {
    return /^node(\.exe)?$/i.test(path.win32.basename(token));
}

/**
 * Environment assignments a shim may carry that this plan cannot reproduce.
 * `dp0` and `_prog` are the template's own bookkeeping, and the PATHEXT tweak
 * only steers the shim's own `node` lookup, so both are harmless. Anything
 * else (pnpm's NODE_PATH and prepended PATH, cmd-shim's `env KEY=value`
 * shebang form) changes how the program runs.
 */
function carriesForeignEnv(content: string): boolean {
    const setRe = /^\s*@?SET\s+"?([A-Za-z_][A-Za-z0-9_]*)=/gim;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop
    while ((match = setRe.exec(content)) !== null) {
        const name = match[1].toLowerCase();
        if (name !== 'dp0' && name !== '_prog' && name !== 'pathext') {
            return true;
        }
    }
    return false;
}

/**
 * Resolve the `%_prog%` indirection npm's template uses: it assigns the
 * interpreter to `_prog` in both branches of an `IF EXIST` before running it.
 * Every assignment must agree that the interpreter is Node.
 */
function progIsNode(content: string, shimDir: string): { ok: boolean; absolute?: string } {
    const progRe = /^\s*@?SET\s+"?_prog=([^"\r\n]*)"?/gim;
    const values: string[] = [];
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop
    while ((match = progRe.exec(content)) !== null) {
        values.push(match[1].trim());
    }
    if (values.length === 0) {
        return { ok: false };
    }
    let absolute: string | undefined;
    for (const value of values) {
        const expanded = expandShimPath(value, shimDir) ?? value;
        if (!isNodeInterpreter(expanded)) {
            return { ok: false };
        }
        // A pinned interpreter outside the shim directory (pnpm's
        // nodeExecPath) is a real runtime choice worth honouring.
        if (path.win32.isAbsolute(value)) {
            absolute = value;
        }
    }
    return { ok: true, ...(absolute ? { absolute } : {}) };
}

/**
 * Read the real entry out of an npm/pnpm/yarn cmd shim's text. Their
 * generators all emit one execution line of the shape
 * `<interpreter> [flags] "<entry>" %*`, with the interpreter either inline
 * or behind `%_prog%`. Returns null whenever the interpreter is not provably
 * Node, or the shim carries semantics a direct spawn would drop, so the
 * caller falls back instead of running the program differently than the shim
 * would have.
 */
/**
 * Lines the known generators write that do not run the program: the batch
 * plumbing, the interpreter lookup, and the bookkeeping assignments. A line
 * outside this list and outside the execution shape means the file is doing
 * something this does not model, and modelling batch line by line is what
 * kept producing edge cases, so the answer there is to stop.
 */
const STRUCTURAL_LINE = [
    /^\s*$/,
    /^\s*@?ECHO\s+off\s*$/i,
    /^\s*@?SETLOCAL\s*$/i,
    /^\s*@?ENDLOCAL\s*$/i,
    /^\s*GOTO\s+\S+\s*$/i,
    /^\s*:\S+\s*$/,
    /^\s*EXIT\s+\/b\s*$/i,
    /^\s*CALL\s+:\S+\s*$/i,
    /^\s*@?SET\s+dp0=%~dp0\s*$/i,
    /^\s*@?SET\s+"?_prog=[^"\r\n]*"?\s*$/i,
    /^\s*@?SET\s+PATHEXT=%PATHEXT:[^%]*%\s*$/i,
    /^\s*@?IF\s+EXIST\s+"[^"]*"\s*\(\s*$/i,
    /^\s*\)\s*ELSE\s*\(\s*$/i,
    /^\s*\)\s*$/,
];

export function parseCmdShimTarget(cmdPath: string, content: string): CmdShimTarget | null {
    // Always win32 path semantics: these shims exist only on Windows, and the
    // tests parse Windows paths on POSIX runners.
    const shimDir = path.win32.dirname(cmdPath);
    if (carriesForeignEnv(content)) {
        return null;
    }
    // Every line has to be accounted for. A line that runs the program must
    // match the execution shape, and every other line must be one of the
    // generators' known structural lines: an unrecognized line could run
    // anything (a branch that does not forward the caller's arguments, a
    // second command), and reading only the lines that look familiar is how
    // a shim gets approved for something it does not do.
    const lines = content.split(/\r?\n/);
    const executionLines: string[] = [];
    for (const line of lines) {
        if (STRUCTURAL_LINE.some((pattern) => pattern.test(line))) {
            continue;
        }
        if (!line.includes('%*')) {
            return null;
        }
        executionLines.push(line);
    }
    if (executionLines.length === 0) {
        return null;
    }
    let agreed: CmdShimTarget | null = null;
    for (const line of executionLines) {
        const parsed = parseExecutionLine(line, content, shimDir);
        if (!parsed) {
            return null;
        }
        if (agreed && !sameTarget(agreed, parsed)) {
            return null;
        }
        agreed ??= parsed;
    }
    return agreed;
}

/** Whether two parses describe the same spawn. */
function sameTarget(a: CmdShimTarget, b: CmdShimTarget): boolean {
    return (
        a.nodeExec === b.nodeExec &&
        a.args.length === b.args.length &&
        a.args.every((value, index) => value === b.args[index])
    );
}

/** One `%*`-forwarding line, or null when it cannot be proven. */
function parseExecutionLine(line: string, content: string, shimDir: string): CmdShimTarget | null {
    {
        const tokens = tokenizeCmdLine(line);
        if (!tokens) {
            return null;
        }
        const forwardIndex = tokens.findIndex((token) => !token.quoted && token.value === '%*');
        // The forwarder has to be the last thing on the line and the only one:
        // a token after it would be passed AFTER the caller's arguments, and a
        // second forwarder would pass each of them twice, neither of which
        // appending once reproduces.
        if (forwardIndex < 2 || forwardIndex !== tokens.length - 1) {
            return null;
        }
        // Everything the shim runs, minus the `%*` it forwards our args into.
        // The npm template prefixes its execution line with batch plumbing
        // (`endLocal & goto ... & "%_prog%" ...`), so the interpreter is the
        // token right after the last unquoted `&`, not the first token on the
        // line.
        const runTokens = tokens.slice(0, forwardIndex);
        const lastAmp = runTokens.reduce(
            (found, token, index) => (!token.quoted && token.value === '&' ? index : found),
            -1,
        );
        let words = lastAmp >= 0 ? runTokens.slice(lastAmp + 1) : runTokens;
        if (words.length < 2) {
            return null;
        }
        let nodeExec: string | undefined;
        // `env -S node --flags` renders as an `-S` interpreter followed by the
        // real one; step past it.
        if (/^-S(\.exe)?$/i.test(path.win32.basename(words[0].value))) {
            words = words.slice(1);
        }
        const interpreter = words[0].value;
        if (interpreter === '%_prog%') {
            const prog = progIsNode(content, shimDir);
            if (!prog.ok) {
                return null;
            }
            nodeExec = prog.absolute;
        } else {
            const expanded = expandShimPath(interpreter, shimDir) ?? interpreter;
            if (!isNodeInterpreter(expanded)) {
                return null;
            }
            if (path.win32.isAbsolute(interpreter)) {
                nodeExec = interpreter;
            }
        }
        // Everything after the interpreter, in order, exactly as the shim
        // would pass it, with cmd's shim-directory variable substituted the
        // way cmd would. Every token has to be provably literal: this does
        // not reimplement cmd's parser, so a token carrying quoting, a caret
        // escape, a positional parameter, or an environment variable makes
        // the whole shim undecidable, and an undecidable shim is declined
        // rather than run with an argv that might differ from the real one.
        const args: string[] = [];
        let expandable = true;
        for (const word of words.slice(1)) {
            const expanded = literalToken(word, shimDir);
            if (expanded === null) {
                expandable = false;
                break;
            }
            args.push(expanded);
        }
        if (!expandable || args.length === 0) {
            return null;
        }
        return { args, ...(nodeExec ? { nodeExec } : {}) };
    }
}

interface ResolveDeps {
    platform: NodeJS.Platform;
    readFileSync: (p: string) => string;
    resolveOnPath: (bin: string, env: NodeJS.ProcessEnv) => string | null;
    execPath: string;
}

const REAL_DEPS: ResolveDeps = {
    platform: process.platform,
    readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
    resolveOnPath: findOnPath,
    execPath: process.execPath,
};

/**
 * Turn a provider invocation into something the current platform can spawn.
 * POSIX passes through untouched. On Windows a bare name resolves through
 * PATH and PATHEXT to the real file; a .cmd/.bat shim around a Node entry is
 * rewritten to a direct `node <entry> <args>` spawn. Anything else — a
 * non-Node shim, a shim with environment semantics, an unparseable one, an
 * unresolvable name — passes through so the caller's own ENOENT/EINVAL
 * handling is the one that fires, naming the command.
 */
export function resolveSpawnPlan(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
    deps: ResolveDeps = REAL_DEPS,
): SpawnPlan {
    if (deps.platform !== 'win32') {
        return { command, args };
    }
    let resolved = command;
    if (!command.includes('/') && !command.includes('\\')) {
        resolved = deps.resolveOnPath(command, env) ?? command;
    }
    if (!/\.(cmd|bat)$/i.test(path.win32.basename(resolved))) {
        return { command: resolved, args };
    }
    let content: string;
    try {
        content = deps.readFileSync(resolved);
    } catch {
        return { command: resolved, args };
    }
    const target = parseCmdShimTarget(resolved, content);
    if (!target) {
        return { command: resolved, args };
    }
    return {
        command: target.nodeExec ?? deps.execPath,
        args: [...target.args, ...args],
    };
}
