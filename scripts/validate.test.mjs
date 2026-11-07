import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Runs the real CLI against a temp registry tree (validate.mjs accepts the
// root as argv[2]); the fixtures never touch registry/ on disk.
const SCRIPT = fileURLToPath(new URL('./validate.mjs', import.meta.url))
const BASE = { name: 'X', type: 'bundle', spec: 'x-plugin', description: 'd', license: 'MIT', author: { name: 'a' } }

function run(root) {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8', stdio: 'pipe' }) }
  } catch (err) {
    return { status: err.status, stderr: String(err.stderr || '') }
  }
}

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'validate-'))
  mkdirSync(join(root, 'registry', 'curated'), { recursive: true })
  writeFileSync(join(root, 'registry', 'blocklist.json'), '[]')
  for (const [file, entry] of Object.entries(entries)) {
    writeFileSync(join(root, 'registry', 'curated', file), JSON.stringify(entry))
  }
  return root
}

test('a single valid entry passes', () => {
  const root = fixture({ 'x-plugin.json': { ...BASE, id: 'x-plugin', repo: 'someone/x-plugin' } })
  try {
    const res = run(root)
    assert.equal(res.status, 0, res.stderr)
    assert.match(res.stdout, /校验通过: 1 个 curated 条目/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two ids for the same repo are rejected, not silently collapsed by the merge', () => {
  const root = fixture({
    'aaa-plugin.json': { ...BASE, id: 'x-plugin', repo: 'someone/x-plugin' },
    'zzz-plugin.json': { ...BASE, id: 'x-plugin-again', repo: 'someone/x-plugin' },
  })
  try {
    const res = run(root)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /指向同一个插件（repo:github\.com\/someone\/x-plugin）/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two ids for the same npm package are rejected even with different repos', () => {
  const root = fixture({
    'aaa-plugin.json': { ...BASE, id: 'x-plugin', repo: 'someone/x-plugin', package: 'x-plugin' },
    'zzz-plugin.json': { ...BASE, id: 'x-plugin-fork', repo: 'other/x-plugin', package: 'x-plugin' },
  })
  try {
    const res = run(root)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /指向同一个插件（pkg:x-plugin）/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
