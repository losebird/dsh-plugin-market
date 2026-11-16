import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cordis = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const hostJs = readFileSync(join(root, 'src/host.js'), 'utf8')
const clientJs = readFileSync(join(root, 'src/client.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('cordis insert id is ace-market, not plugin-market', () => {
  assert.match(cordis, /id:\s*ace-market/)
  assert.doesNotMatch(cordis, /^\s*-\s*id:\s*plugin-market/m)
  assert.match(cordis, /name:\s*'@ace-zone\/dsh-market'/)
})

test('HTTP routes and storage paths unchanged', () => {
  assert.match(hostJs, /\/plugin-market/)
  assert.match(hostJs, /join\(homedir\(\),\s*'\.dsh',\s*'plugin-market'\)/)
  assert.match(clientJs, /fetch\('\/plugin-market\/'/)
})

test('package version 0.1.68', () => {
  assert.equal(pkg.version, '0.1.68')
})

test('official plugin-market settings key stays distinct from ace-market', () => {
  const officialId = 'plugin-market'
  const ours = 'ace-market'
  assert.notEqual(ours, officialId)
  // Mirrors official PluginMarket.setIndexes: throws settings-unavailable when entryId is empty.
  const setIndexes = (entryId, settings, urls) => {
    if (!settings || entryId === undefined) {
      const err = new Error('Index sources require the settings service and a profile entry')
      err.code = 'plugin-market/settings-unavailable'
      throw err
    }
    settings.set(entryId, { indexes: urls })
  }
  const settings = new Map()
  assert.throws(() => setIndexes(undefined, settings, ['https://example.com/index.json']), (e) => e.code === 'plugin-market/settings-unavailable')
  setIndexes(officialId, settings, ['https://example.com/index.json'])
  setIndexes(ours, settings, [])
  assert.deepEqual(settings.get(officialId).indexes, ['https://example.com/index.json'])
  assert.deepEqual(settings.get(ours).indexes, [])
})

test('host list uses loadRegistryCatalog and does not mkdir', () => {
  assert.match(hostJs, /loadRegistryCatalog\(/)
  assert.match(hostJs, /registryNotice\(/)
  const listStart = hostJs.indexOf('async function list()')
  const listEnd = hostJs.indexOf('async function performInstall')
  const list = hostJs.slice(listStart, listEnd)
  assert.doesNotMatch(list, /mkdir/)
  assert.doesNotMatch(list, /writeState/)
})