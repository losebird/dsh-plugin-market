import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientJs = readFileSync(join(root, 'src/client.js'), 'utf8')
const shopJsx = readFileSync(join(root, 'web/src/App.jsx'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const UNVER = '未验证（仓库没声明能挂上的插件）。没有一键安装，请到仓库看作者说明。'
const PACK = '下载 zip 后解压：skill 放到 ~/.agents/skills/，preset 放到 ~/.dsh/.agent-presets/。'

test('package.json is 0.1.66', () => {
  assert.equal(pkg.version, '0.1.66')
})

test('MARKET_VERSION matches package.json and shows version before officialSite', () => {
  const m = clientJs.match(/const MARKET_VERSION = '([^']+)'/)
  assert.ok(m, 'MARKET_VERSION constant')
  assert.equal(m[1], pkg.version)
  assert.match(
    clientJs,
    /h\('span', \{ className: 'dshm-ver'[^}]*\}, MARKET_VERSION\),\s*h\('a', \{ className: 'dshm-viewbtn', href: 'https:\/\/www\.dsh-plugin\.shop\/'/,
  )
  assert.doesNotMatch(
    clientJs,
    /className: 'dshm-title' \}, t\('title'\)\),\s*h\('span', \{ className: 'dshm-pill', title: '@ace-zone\/dsh-market' \}, MARKET_VERSION\)/,
  )
  assert.match(clientJs, /\.dshm-ver\s*\{[^}]*font-size:\s*11px[^}]*opacity:\s*0\.75/)
})

test('I18N references INSTALL_COPY for shared install copy', () => {
  assert.match(clientJs, /packNote: INSTALL_COPY\.zh\.packNote/)
  assert.match(clientJs, /noneCopyNote: INSTALL_COPY\.zh\.unverNote/)
  assert.match(clientJs, /appNote: INSTALL_COPY\.en\.appNote/)
})

test('client.js still registers the AMD bundle', () => {
  assert.doesNotMatch(clientJs, /^\s*import\s/m)
  assert.doesNotMatch(clientJs, /^\s*export\s/m)
  assert.match(clientJs, /window\.__ModuleLoader__\.load/)
  assert.match(clientJs, /id:\s*'@ace-zone\/dsh-market'/)
})

test('new pack / unverified / none strings exist and drop the old lies', () => {
  assert.ok(clientJs.includes(UNVER), 'zh unver/none note')
  assert.ok(clientJs.includes(PACK), 'zh packNote')
  assert.ok(clientJs.includes('Download the zip and unpack — skills to ~/.agents/skills/'), 'en packNote')
  assert.doesNotMatch(clientJs, /从本地导入/)
  assert.doesNotMatch(clientJs, /DSH will read the README/)
  assert.doesNotMatch(clientJs, /请在 DSH 插件市场查看/)
  assert.match(clientJs, /emptyFilter: '没有匹配的插件（\{filter\}）'/)
})

test('loadInstalled is invoked from refresh and from market open', () => {
  const refreshStart = clientJs.indexOf('const refresh = async () => {')
  const loadDef = clientJs.indexOf('const loadInstalled = async () => {')
  assert.ok(refreshStart >= 0 && loadDef > refreshStart)
  const refresh = clientJs.slice(refreshStart, loadDef)
  assert.match(refresh, /await loadInstalled\(\)/)

  const openCalls = clientJs.match(/patch\(\{ open: true, detail: null \}\)[\s\S]{0,80}loadInstalled\(\)/g)
  assert.ok(openCalls && openCalls.length >= 2, 'loadInstalled must run from settings open and launch click')
})

test('installedRec overlays mRows by package / spec / name', () => {
  assert.match(clientJs, /function installedRec\(item, st\)/)
  const rec = clientJs.slice(clientJs.indexOf('function installedRec(item, st)'), clientJs.indexOf('function Card(item, st)'))
  assert.match(rec, /item\.package,\s*item\.spec,\s*item\.name,\s*item\.id/)
  assert.match(rec, /st\.mRows/)
  assert.match(rec, /st\.installed\[item\.id\]/)
})

test('search with text ignores group/tab filter; empty names the tab', () => {
  const overlay = clientJs.slice(clientJs.indexOf("slots.inject('shell.overlay'"), clientJs.lastIndexOf('return { apply }'))
  assert.match(overlay, /const searchActive = qTrim\.length > 0/)
  assert.match(overlay, /if \(searchActive\) \{\s*base = catalog/)
  assert.doesNotMatch(overlay, /group === 'all'/)
  assert.match(overlay, /searchActive\s*\n\s*\? t\('empty'\)/)
  assert.match(overlay, /t\('emptyFilter'/)
})

test('job cancel closes the dialog and stops polling without claiming host kill', () => {
  const cancel = clientJs.slice(clientJs.indexOf('const cancelJob = () => {'), clientJs.indexOf("className: 'dshm-overlay dshm-job-overlay'"))
  assert.match(cancel, /jobTimers/)
  assert.match(cancel, /clearTimeout/)
  assert.match(cancel, /job:\s*null/)
  assert.doesNotMatch(cancel, /job-cancel/)
  assert.doesNotMatch(cancel, /killed|已取消|已终止/)
})

test('market 卸载 hides 交给 DSH 卸载', () => {
  const detail = clientJs.slice(clientJs.indexOf('function DetailView(st)'), clientJs.indexOf('function ManageView(st)'))
  const manage = clientJs.slice(clientJs.indexOf('function ManageView(st)'), clientJs.indexOf("slots.inject('settings.section'"))
  assert.match(detail, /t\('uninstall'\)/)
  assert.doesNotMatch(detail, /agentUninstall/)
  assert.doesNotMatch(manage, /agentUninstall/)
})

test('shop I18N matches pack / unverified / none copy', () => {
  assert.match(shopJsx, /'detail\.packNote': INSTALL_COPY\.zh\.packNote/)
  assert.match(shopJsx, /'detail\.unverified': INSTALL_COPY\.zh\.unverNote/)
  assert.match(shopJsx, /'copiedModal\.noneGuide': INSTALL_COPY\.en\.unverNote/)
  assert.match(shopJsx, /import \{[^}]*INSTALL_COPY[^}]*\} from '\.\.\/\.\.\/src\/install-info\.mjs'/)
  const installInfo = readFileSync(join(root, 'src/install-info.mjs'), 'utf8')
  assert.ok(installInfo.includes(UNVER), 'install-info zh unver/none note')
  assert.ok(installInfo.includes(PACK), 'install-info zh packNote')
  assert.doesNotMatch(shopJsx, /从本地导入/)
  assert.match(shopJsx, /dir\.emptyTab/)
  assert.match(shopJsx, /qTrimmed\s*\n\s*\? \[\.\.\.items\]/)
})
