# Contributing to ModLens

First, the policy: **ModLens does not accept pull requests.** It is a
deliberately small tool with a single maintainer who reviews and owns every
line, and keeping that loop tight is what keeps it dependable.

Two contributions that genuinely help:

- **[Open an issue](https://github.com/liustack/modlens/issues).** Bugs, ideas,
  a confusing error message, docs that read wrong. Issues get read and drive
  what gets built. The templates tell you what to include.
- **Fork it.** The MIT license means your copy is fully yours: rename it,
  rewire it, publish it. No permission needed.

Everything below is for people working on a fork.

## Scope

ModLens does one thing: turn an image into structured JSON evidence for
text-only models. Web search and page fetching live in a sibling project
([ModSearch](https://github.com/liustack/modsearch)), not here.

## Setup

```bash
pnpm install
pnpm test        # vitest, all suites
pnpm typecheck   # tsc --noEmit
pnpm build       # must produce a single dist/main.js
pnpm lint        # Biome
```

Requires Node 22.19+.

## Tests

- Tests are co-located: a module lives beside its `*.test.ts`. New behavior or
  a bug fix ships with a test in the same commit.
- No network in unit tests. Stub `fetch` with `vi.stubGlobal('fetch', ...)` and
  clean up in `afterEach`.
- ESM namespaces cannot be spied on, so use real temp files
  (`fs.mkdtempSync`) and remove them in the test. Fake `$HOME` for config and
  transcript paths, and restore it in `finally`.
- Real provider calls (agy, API keys, a Claude login) are end-to-end checks,
  not unit tests. Keep them out of `pnpm test`.

More detail lives in [docs/testing.md](docs/testing.md).

## Commits

- [Conventional Commits](https://www.conventionalcommits.org):
  `type(scope): imperative summary`, no trailing period, summary under ~72
  chars.
- One commit does one thing, and the tree still builds and tests after each.
  Do not mix a refactor or a reformat with a behavior change.
- 4-space indentation, enforced by Biome. Keep a reformat in its own commit.

Full conventions are in [docs/commit.md](docs/commit.md). The broader design
notes are in [AGENTS.md](AGENTS.md).
