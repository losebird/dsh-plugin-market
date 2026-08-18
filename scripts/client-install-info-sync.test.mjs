import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { helpDownloadUrl, officialDownloadUrl, INSTALL_COPY } from '../src/install-info.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientJs = readFileSync(join(root, 'src/client.js'), 'utf8')
const installInfo = readFileSync(join(root, 'src/install-info.mjs'), 'utf8')
const shopJsx = readFileSync(join(root, 'web/src/App.jsx'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

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
  assert.match(card, /canHelpInstall/)
  assert.match(card, /helpItem:\s*item/)
  assert.doesNotMatch(card, /href: pres\.downloadUrl/)
  assert.doesNotMatch(card, /t\('officialDownload'\)/)

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

  assert.match(detail, /helpItem:\s*item/)
  assert.doesNotMatch(detail, /install\.method === 'manual'/)
  assert.doesNotMatch(detail, /method === 'git-clone'/)
})

test('Card/detail 安装 for non-one-click uses helpItem', () => {
  const card = clientJs.slice(clientJs.indexOf('function Card(item, st)'), clientJs.indexOf('function InstallPanel(st, item)'))
  const detail = clientJs.slice(clientJs.indexOf('function DetailView(st)'), clientJs.indexOf('function ManageView(st)'))
  assert.match(card, /pres\.kind === 'app' \|\| pres\.kind === 'pack' \|\| pres\.kind === 'none'/)
  assert.match(card, /canHelpInstall/)
  assert.match(card, /helpItem:\s*item/)
  assert.match(detail, /helpItem:\s*item/)
  assert.match(detail, /pres\.kind === 'app' \|\| pres\.kind === 'pack' \|\| pres\.kind === 'none'/)
})

test('INSTALL_COPY has help dialog keys', () => {
  for (const lang of ['zh', 'en']) {
    for (const key of ['helpTitle', 'unverHelp', 'packHelp', 'appHelp', 'openRepo', 'openDownload', 'agentHelp']) {
      assert.equal(typeof INSTALL_COPY[lang][key], 'string')
      assert.ok(INSTALL_COPY[lang][key].length > 0, lang + '.' + key)
    }
  }
})

test('HelpDialogView exists; agentHelp gated by pres.kind !== app', () => {
  const start = clientJs.indexOf('function HelpDialogView(st)')
  assert.ok(start > 0, 'HelpDialogView')
  const help = clientJs.slice(start, clientJs.indexOf('slots.inject(\'shell.overlay\''))
  assert.match(help, /dshm-overlay dshm-help-overlay/)
  assert.match(help, /pres\.kind !== 'app'/)
  assert.match(help, /t\('agentHelp'\)/)
  assert.match(help, /runAgentInstall/)
  const agentIdx = help.indexOf("pres.kind !== 'app'")
  assert.ok(agentIdx >= 0)
  const afterGate = help.slice(agentIdx)
  assert.match(afterGate, /agentHelp/)
})

test('shop App.jsx help modal uses INSTALL_COPY and has no 交给 DSH', () => {
  assert.match(shopJsx, /INSTALL_COPY/)
  assert.match(shopJsx, /helpTitle/)
  assert.match(shopJsx, /helpDownloadUrl/)
  assert.doesNotMatch(shopJsx, /agentHelp/)
  assert.doesNotMatch(shopJsx, /交给 DSH 协助/)
})

test('MARKET_VERSION matches package.json', () => {
  const m = clientJs.match(/const MARKET_VERSION = '([^']+)'/)
  assert.ok(m, 'MARKET_VERSION')
  assert.equal(m[1], pkg.version)
  assert.equal(pkg.version, '0.1.66')
})

test('helpDownloadUrl: pack zip, dsh-tui homepage, unverified repo releases', () => {
  const pack = {
    id: 'baobiao-api-overview',
    type: 'pack',
    repo: 'Tingman/baobiao-api-skills',
    spec: 'https://github.com/Tingman/baobiao-api-skills/releases/download/v1.0.1/baobiao-api-overview-v1.0.1.zip',
    install: { method: 'pack' },
  }
  assert.equal(
    helpDownloadUrl(pack),
    'https://github.com/Tingman/baobiao-api-skills/releases/download/v1.0.1/baobiao-api-overview-v1.0.1.zip',
  )

  const tui = {
    id: 'deepseek-harness-tui-dsh-tui',
    name: '@deepseek-harness-tui/dsh-tui',
    type: 'bundle',
    package: '@deepseek-harness-tui/dsh-tui',
    repo: 'ccch1mneyyy/dsh-TUI',
    homepage: 'https://github.com/ccch1mneyyy/dsh-TUI',
    spec: 'github:ccch1mneyyy/dsh-TUI#v0.6.1',
    verified: true,
    install: { method: 'npm-global', command: 'npm install -g @deepseek-ai/dsh' },
  }
  assert.equal(helpDownloadUrl(tui), 'https://github.com/ccch1mneyyy/dsh-TUI')

  const unver = {
    id: 'foo-bar',
    name: 'foo-bar',
    type: 'bundle',
    repo: 'foo/bar',
    spec: 'github:foo/bar',
    verified: false,
  }
  assert.equal(officialDownloadUrl(unver), 'https://github.com/foo/bar/releases')
  assert.equal(helpDownloadUrl(unver), 'https://github.com/foo/bar/releases')
})
