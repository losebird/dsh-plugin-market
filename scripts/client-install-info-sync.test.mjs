import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientJs = readFileSync(join(root, 'src/client.js'), 'utf8')
const installInfo = readFileSync(join(root, 'src/install-info.mjs'), 'utf8')

// The inlined helper block in client.js must stay in sync with src/install-info.mjs.
test('client.js has no ESM import statements', () => {
  assert.doesNotMatch(clientJs, /^\s*import\s/m)
})

test('client.js still registers the AMD bundle', () => {
  assert.match(clientJs, /window\.__ModuleLoader__\.load/)
  assert.match(clientJs, /id:\s*'@ace-zone\/dsh-market'/)
})

test('client.js still uses installPresentation and installCommand', () => {
  assert.match(clientJs, /installPresentation\(/)
  assert.match(clientJs, /installCommand\(/)
})

test('inlined install helpers match install-info.mjs', () => {
  const startMarker = '// Shared install *presentation*'
  const endMarker = 'window.__ModuleLoader__.load'
  const start = clientJs.indexOf(startMarker)
  const end = clientJs.indexOf(endMarker)
  assert.ok(start >= 0, 'missing shared install presentation block in client.js')
  assert.ok(end > start, 'missing __ModuleLoader__.load after inlined helpers')
  const inlined = clientJs.slice(start, end).trim()
  const expected = installInfo.replace(/^export /gm, '').trim()
  assert.equal(inlined, expected)
})
