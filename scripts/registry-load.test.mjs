import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  registryUrls, pickRegistryItems, catalogFromParsed,
  SHOP_REGISTRY, RAW_GITHUB_REGISTRY,
} from '../src/registry-load.mjs'

test('host default order is shop then raw (never raw first)', () => {
  const urls = registryUrls()
  assert.equal(urls[0], SHOP_REGISTRY)
  assert.deepEqual(urls, [SHOP_REGISTRY, RAW_GITHUB_REGISTRY])
})

test('DSH_MARKET_REGISTRY env url is first when set', () => {
  const urls = registryUrls({ envUrl: 'https://example.com/all.json' })
  assert.deepEqual(urls, [
    'https://example.com/all.json',
    SHOP_REGISTRY,
    RAW_GITHUB_REGISTRY,
  ])
})

test('empty env url is skipped', () => {
  assert.deepEqual(registryUrls({ envUrl: '   ' }), [SHOP_REGISTRY, RAW_GITHUB_REGISTRY])
  assert.deepEqual(registryUrls({ envUrl: '' }), [SHOP_REGISTRY, RAW_GITHUB_REGISTRY])
})

test('website pages copy is first, then raw', () => {
  const urls = registryUrls({ pagesUrl: '/registry/all.json' })
  assert.equal(urls[0], '/registry/all.json')
  assert.equal(urls[1], RAW_GITHUB_REGISTRY)
  assert.ok(!urls.includes(SHOP_REGISTRY) || urls[0] === '/registry/all.json')
})

test('duplicate env shop url is not listed twice', () => {
  const urls = registryUrls({ envUrl: SHOP_REGISTRY })
  assert.deepEqual(urls, [SHOP_REGISTRY, RAW_GITHUB_REGISTRY])
})

test('pickRegistryItems requires an items array', () => {
  assert.equal(pickRegistryItems(null), null)
  assert.equal(pickRegistryItems({}), null)
  assert.deepEqual(pickRegistryItems({ items: [] }), [])
  assert.deepEqual(pickRegistryItems({ items: [{ id: 'a' }] }), [{ id: 'a' }])
})

test('catalogFromParsed collapses same package + same owner', () => {
  const parsed = {
    items: [
      { id: 'deepseek-harness-tui-dsh-tui', package: '@deepseek-harness-tui/dsh-tui', repo: 'ccch1mneyyy/dsh-cc-tui', version: 'v0.8.0', stars: 1625 },
      { id: 'deepseek-harness-tui-dsh-tui', package: '@deepseek-harness-tui/dsh-tui', repo: 'ccch1mneyyy/dsh-TUI', version: 'v0.6.1', stars: 1619 },
      { id: 'dsh-tui', package: 'dsh-tui', repo: 'orriduck/dsh-tui', stars: 3 },
    ],
  }
  const catalog = catalogFromParsed(parsed)
  assert.equal(catalog.length, 2)
  assert.equal(catalog[0].repo, 'ccch1mneyyy/dsh-cc-tui')
  assert.ok(catalog.some((it) => it.repo === 'orriduck/dsh-tui'))
})
