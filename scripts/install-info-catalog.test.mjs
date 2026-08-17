import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installPresentation, isKitchenCommand } from '../src/install-info.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadItems(file) {
  const data = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
  return Array.isArray(data.items) ? data.items : []
}

function assertSafe(item, info) {
  const cmd = info.command || ''
  assert.equal(isKitchenCommand(cmd), false, item.id + ' kitchen command')
  assert.doesNotMatch(cmd, /github:/i)
  assert.doesNotMatch(cmd, /git clone/)
  assert.doesNotMatch(cmd, /git clone --branch/)
  assert.doesNotMatch(cmd, /仓库到/)
  assert.doesNotMatch(cmd, /curl\b/)
  assert.doesNotMatch(cmd, /npm install -g/)
  if (info.kind === 'plugin' || info.kind === 'companion') {
    assert.match(cmd, /^dsh plugin --profile web add \S+$/)
  } else {
    assert.equal(cmd, '')
  }
  if (info.kind === 'pack') {
    assert.doesNotMatch(cmd, /dsh plugin --profile web add/)
  }
}

test('catalog sample: named fixtures keep type-aware presentation', () => {
  const items = loadItems('registry/all.json')
  const byId = new Map(items.map((it) => [it.id, it]))

  const sidebar = items.find((it) => it.id === 'dsh-better-sidebar' && it.package === 'dsh-better-sidebar')
  assert.ok(sidebar, 'dsh-better-sidebar present')
  const sidebarInfo = installPresentation(sidebar)
  assert.equal(sidebarInfo.kind, 'plugin')
  assert.equal(sidebarInfo.command, 'dsh plugin --profile web add dsh-better-sidebar')

  const tui = items.find((it) => it.package === '@deepseek-harness-tui/dsh-tui' || it.id === 'deepseek-harness-tui-dsh-tui')
  assert.ok(tui, 'dsh-tui present')
  const tuiInfo = installPresentation(tui)
  assert.equal(tuiInfo.kind, 'app')
  assert.equal(tuiInfo.command, null)

  const openDesign = byId.get('open-design')
  assert.ok(openDesign, 'open-design present')
  const od = installPresentation(openDesign)
  assert.equal(od.kind, 'app')
  assert.equal(od.command, null)

  const pack = items.find((it) => it.id === 'baobiao-api-overview' || it.type === 'pack')
  assert.ok(pack, 'pack present')
  const packInfo = installPresentation(pack)
  assert.equal(packInfo.kind, 'pack')
  assert.equal(packInfo.command, null)

  const vision = items.find((it) => it.package === '@anionex/dsh-vision-toolkit')
  assert.ok(vision, 'vision toolkit present')
  const v = installPresentation(vision)
  assert.equal(v.kind, 'plugin')
  assert.equal(v.command, 'dsh plugin --profile web add @anionex/dsh-vision-toolkit')
})

test('no catalog row copies kitchen / github: / truncated git clone', () => {
  const items = [...loadItems('registry/all.json'), ...loadItems('registry/index.json')]
  assert.ok(items.length > 10)
  for (const item of items) {
    assertSafe(item, installPresentation(item))
  }
})
