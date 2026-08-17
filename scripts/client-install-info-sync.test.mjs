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

test('client.js has no ESM export statements', () => {
  assert.doesNotMatch(clientJs, /^\s*export\s/m)
})

test('Card and InstallPanel follow installPresentation kinds', () => {
  const cardStart = clientJs.indexOf('function Card(item, st)')
  const panelStart = clientJs.indexOf('function InstallPanel(st, item)')
  const detailStart = clientJs.indexOf('function DetailView(st)')
  assert.ok(cardStart > 0 && panelStart > cardStart && detailStart > panelStart)
  const card = clientJs.slice(cardStart, panelStart)
  const panel = clientJs.slice(panelStart, detailStart)
  const detail = clientJs.slice(detailStart, clientJs.indexOf('function ManageView(st)'))

  assert.match(card, /installPresentation\(item\)/)
  assert.match(card, /pres\.kind === 'plugin' \|\| pres\.kind === 'companion'/)
  assert.match(card, /pres\.kind === 'app'/)
  assert.match(card, /t\('officialDownload'\)/)
  assert.match(card, /href: pres\.downloadUrl/)

  assert.doesNotMatch(panel, /inst\.method === 'manual'/)
  assert.doesNotMatch(panel, /officialInstall/)
  assert.doesNotMatch(panel, /runAgentInstall/)

  const appBranch = panel.slice(panel.indexOf("pres.kind === 'app'"), panel.indexOf("pres.kind === 'pack'"))
  const packBranch = panel.slice(panel.indexOf("pres.kind === 'pack'"), panel.indexOf("noneCopyNote"))
  assert.doesNotMatch(appBranch, /installBtn/)
  assert.doesNotMatch(appBranch, /installNow/)
  assert.match(appBranch, /appNote/)
  assert.doesNotMatch(packBranch, /installBtn/)
  assert.doesNotMatch(packBranch, /dsh plugin/)
  assert.match(packBranch, /packDownload/)
  assert.match(packBranch, /packNote/)

  assert.match(detail, /installPresentation\(item\)\.kind === 'plugin' \|\| installPresentation\(item\)\.kind === 'companion'/)
  assert.doesNotMatch(detail, /install\.method === 'manual'/)
  assert.doesNotMatch(detail, /method === 'git-clone'/)
})
