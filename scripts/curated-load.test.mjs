import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadCuratedItems } from './collect.mjs'

test('loadCuratedItems merges index.json and registry/curated/*.json', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'curated-load-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/index.json'),
      JSON.stringify({ items: [{ id: 'from-index', name: 'Index', repo: 'owner/index-plugin' }] }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/foo.json'),
      JSON.stringify({ id: 'foo', name: 'Foo', repo: 'owner/foo' }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/from-index.json'),
      JSON.stringify({ id: 'from-index', name: 'FileWins', repo: 'owner/index-plugin' }),
    )
    writeFileSync(join(tmpRoot, 'registry/curated/.gitkeep'), '')

    const result = loadCuratedItems(tmpRoot)

    assert.ok(result.some((it) => it.id === 'foo'), 'includes foo from curated file')
    const indexPlugin = result.find((it) => it.repo === 'owner/index-plugin')
    assert.ok(indexPlugin, 'includes owner/index-plugin entry')
    assert.equal(indexPlugin.name, 'FileWins', 'curated file overrides index by keyOf')
    assert.equal(result.length, 2, 'no extra junk from .gitkeep')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})
