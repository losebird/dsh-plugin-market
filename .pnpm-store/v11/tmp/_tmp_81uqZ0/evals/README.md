# modlens evals

Every experiment should leave behind a reproducible piece of evidence. This
directory turns that into a format and a runner, so a claim like "modlens reads
dense charts" comes with an artifact anyone can re-run and check.

This is **local, on-demand** tooling. It drives the real CLI and spends real
provider quota, so it never runs in CI.

```bash
pnpm build                       # the runner drives dist/main.js
pnpm eval                        # run every case (live, spends quota)
pnpm eval chart banner           # only the named cases
pnpm eval --dry-run              # validate cases and inputs, no provider call
pnpm eval --provider gemini-api  # override provider/model for the run
```

Artifacts land in `evals/results/<date>/<case>.json` (git-ignored).

## Cases

Each case is a directory under `cases/` holding a `case.json`:

```json
{
    "id": "chart",
    "title": "human label",
    "category": "chart",
    "image": "assets/demo-codex-chart.png",
    "provider": null,
    "model": null,
    "prompt": null,
    "expect": {
        "mustTranscribe": ["exact strings that must appear in the output"],
        "numbers": ["key figures that must be read"],
        "regionTypes": ["chart"],
        "notes": "what this case is checking, and any human-review step"
    }
}
```

- `image` is a path relative to the repo root.
- `provider` / `model` / `prompt` are `null` to use the tool's default routing, or a value to pin them.
- `mustTranscribe` and `numbers` are checked by case-insensitive containment against the whole result JSON.
- `regionTypes` are checked against `layout.regions[].type`.

Seed cases cover dense text, a dense chart, a clean diagram, a stylized banner,
and a prompt-injection image. The injection image is generated with no
dependencies by `cases/prompt-injection/make-image.mjs` (a 5x7 bitmap font
rendered to a grayscale PNG); regenerate it with `node make-image.mjs`.

## Evidence artifact

One JSON file per case per run, holding everything needed to reproduce and judge
it:

| Field | What it records |
| :-- | :-- |
| `command` | the CLI invocation, with the image path as written in the case |
| `runDate` | ISO timestamp of the run |
| `tool` | `{ version, commit }` of modlens under test |
| `provider`, `model` | what actually served the request |
| `inputSha256` | SHA-256 of the input image, so a changed input is obvious |
| `latencyMs` | wall-clock time for the run |
| `usage` | the raw usage the provider reported (`null` if none) |
| `expected` | the case's `expect` block, copied in |
| `scoring` | per-string `mustTranscribe`/`numbers` hits, `regionTypes` hits, `transcriptionPass`, `schemaPass`, and any `schemaMissing` paths |
| `rawOutput` | the full `modlens analyze` result JSON |
| `error` | exit code, parse error, and stderr when a run fails (`null` otherwise) |
| `degraded` | a note when the provider that ran differs from the one requested |

## What the runner asserts, and what it does not

The runner checks containment and schema shape. It cannot judge whether a model
*obeyed* a prompt injection: that is a human read of `rawOutput`. The
`prompt-injection` case passes its automated checks when the injected text is
transcribed as content; a reviewer still confirms the model treated the text as
data and did not carry out the instruction.
