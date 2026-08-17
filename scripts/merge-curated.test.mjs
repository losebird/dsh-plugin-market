import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mergeCurated } from './merge-curated.mjs'

function readAll(root) {
  const data = JSON.parse(readFileSync(join(root, 'registry/all.json'), 'utf8'))
  return data.items
}

test('missing all.json starts from [] and applies curated defaults', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/curated/bundle.json'),
      JSON.stringify({
        id: 'my-bundle',
        name: 'My Bundle',
        type: 'bundle',
        repo: 'owner/my-bundle',
        spec: 'owner/my-bundle',
        description: 'd',
        license: 'MIT',
        author: { name: 'owner' },
      }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/pack.json'),
      JSON.stringify({
        id: 'my-pack',
        name: 'My Pack',
        type: 'pack',
        repo: 'owner/my-pack',
        spec: 'https://example.com/pack.zip',
        description: 'd',
        license: 'MIT',
        author: { name: 'owner' },
      }),
    )

    const { merged } = mergeCurated(tmpRoot)
    assert.equal(merged, 2)

    const items = readAll(tmpRoot)
    const bundle = items.find((it) => it.id === 'my-bundle')
    const pack = items.find((it) => it.id === 'my-pack')
    assert.equal(bundle.source, 'curated')
    assert.equal(bundle.verified, true)
    assert.deepEqual(bundle.install, { method: 'dsh-plugin-add' })
    assert.equal(pack.source, 'curated')
    assert.equal(pack.verified, true)
    assert.deepEqual(pack.install, { method: 'pack' })
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('curated replaces existing auto item with same repo key', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/all.json'),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'auto-one',
            name: 'Auto Name',
            type: 'bundle',
            repo: 'owner/same-repo',
            source: 'auto',
            auto: true,
            stars: 10,
            description: 'auto',
          },
        ],
      }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/same.json'),
      JSON.stringify({
        id: 'curated-one',
        name: 'Curated Wins',
        type: 'bundle',
        repo: 'owner/same-repo',
        spec: 'owner/same-repo',
        description: 'curated',
        license: 'MIT',
        author: { name: 'owner' },
        stars: 1,
      }),
    )

    mergeCurated(tmpRoot)
    const items = readAll(tmpRoot)
    assert.equal(items.length, 1)
    assert.equal(items[0].id, 'curated-one')
    assert.equal(items[0].name, 'Curated Wins')
    assert.equal(items[0].source, 'curated')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('new curated repo is appended to existing all.json', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/all.json'),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'keep-me',
            name: 'Keep',
            type: 'bundle',
            repo: 'owner/keep',
            source: 'auto',
            stars: 5,
          },
        ],
      }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/new.json'),
      JSON.stringify({
        id: 'new-one',
        name: 'New',
        type: 'bundle',
        repo: 'owner/new-repo',
        spec: 'owner/new-repo',
        description: 'd',
        license: 'MIT',
        author: { name: 'owner' },
      }),
    )

    mergeCurated(tmpRoot)
    const items = readAll(tmpRoot)
    assert.equal(items.length, 2)
    assert.ok(items.some((it) => it.id === 'keep-me'))
    assert.ok(items.some((it) => it.id === 'new-one'))
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('shared-repo pair in existing all.json is not collapsed', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    const sharedRepo = 'losebird/dsh-plugin-market'
    writeFileSync(
      join(tmpRoot, 'registry/all.json'),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'dsh-plugin-market',
            name: 'DSH 插件市场',
            type: 'bundle',
            package: 'dsh-plugin-market',
            repo: sharedRepo,
            source: 'curated',
            stars: 0,
          },
          {
            id: 'demo-hello',
            name: 'Demo Hello Skill',
            type: 'pack',
            repo: sharedRepo,
            source: 'curated',
            stars: 0,
          },
        ],
      }),
    )
  // no curated files — merge should preserve both entries
    mergeCurated(tmpRoot)
    const items = readAll(tmpRoot)
    assert.equal(items.length, 2)
    assert.ok(items.some((it) => it.id === 'dsh-plugin-market'))
    assert.ok(items.some((it) => it.id === 'demo-hello'))
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('curated without githubId replaces auto item keyed by ghid + same repo', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/all.json'),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'auto-one',
            name: 'Auto Name',
            type: 'bundle',
            repo: 'owner/same-repo',
            githubId: 12345,
            source: 'auto',
            auto: true,
            stars: 10,
          },
        ],
      }),
    )
    writeFileSync(
      join(tmpRoot, 'registry/curated/same.json'),
      JSON.stringify({
        id: 'curated-one',
        name: 'Curated Wins',
        type: 'bundle',
        repo: 'owner/same-repo',
        spec: 'owner/same-repo',
        description: 'curated',
        license: 'MIT',
        author: { name: 'owner' },
      }),
    )

    mergeCurated(tmpRoot)
    const items = readAll(tmpRoot)
    assert.equal(items.length, 1)
    assert.equal(items[0].id, 'curated-one')
    assert.equal(items[0].source, 'curated')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('does not write auto.json', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'merge-curated-'))
  try {
    mkdirSync(join(tmpRoot, 'registry/curated'), { recursive: true })
    writeFileSync(
      join(tmpRoot, 'registry/curated/x.json'),
      JSON.stringify({
        id: 'x',
        name: 'X',
        type: 'bundle',
        repo: 'owner/x',
        spec: 'owner/x',
        description: 'd',
        license: 'MIT',
        author: { name: 'owner' },
      }),
    )

    mergeCurated(tmpRoot)
    assert.equal(existsSync(join(tmpRoot, 'registry/auto.json')), false)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})
