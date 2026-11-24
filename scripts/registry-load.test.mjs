import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  registryUrls, pickRegistryItems, catalogFromParsed,
  SHOP_REGISTRY, RAW_GITHUB_REGISTRY,
  loadRegistryCatalog, registryNotice, attemptErrorMessage,
  REGISTRY_TIMEOUT_MS,
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

test('attemptErrorMessage maps TimeoutError and AbortError to timeout', () => {
  assert.equal(attemptErrorMessage({ name: 'TimeoutError', message: 'x' }), 'timeout')
  assert.equal(attemptErrorMessage({ name: 'AbortError', message: 'x' }), 'timeout')
  assert.equal(attemptErrorMessage(new Error('network down')), 'network down')
})

test('first URL timeout, second succeeds → fallback notice', async () => {
  const urls = ['https://a.example/all.json', 'https://b.example/all.json']
  const fetchImpl = async (url, opts) => {
    if (url === urls[0]) {
      assert.ok(opts && opts.signal)
      throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'a' }] }),
    }
  }
  const out = await loadRegistryCatalog({ urls, fetchImpl, timeoutMs: 20, now: Date.now })
  assert.ok(out.items && out.items.length >= 1)
  assert.equal(out.source, 'remote')
  assert.equal(out.attempts[0].ok, false)
  assert.equal(out.attempts[0].error, 'timeout')
  assert.equal(out.attempts[1].ok, true)
  assert.equal(registryNotice({ items: out.items, attempts: out.attempts }), '首选源不可用，已改用备用源')
})

test('slow fetch is aborted by timeoutMs', async () => {
  const fetchImpl = (_url, opts) => new Promise((_resolve, reject) => {
    // Keep the event loop alive until AbortSignal.timeout fires (its timer is unref'd).
    const keep = setTimeout(() => {}, 5000)
    opts.signal.addEventListener('abort', () => {
      clearTimeout(keep)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    })
  })
  const t0 = Date.now()
  const out = await loadRegistryCatalog({
    urls: ['https://slow.example/all.json'],
    fetchImpl,
    timeoutMs: 40,
  })
  assert.ok(Date.now() - t0 < 1000)
  assert.equal(out.source, 'demo')
  assert.equal(out.items, null)
  assert.equal(out.attempts[0].ok, false)
  assert.equal(out.attempts[0].error, 'timeout')
  assert.equal(registryNotice({ items: out.items, attempts: out.attempts }), '远程 registry 暂不可用，已回退演示数据')
})

test('all URLs fail → demo source and demo notice', async () => {
  const urls = ['https://a.example/all.json', 'https://b.example/all.json']
  const fetchImpl = async () => {
    throw Object.assign(new Error('fail'), { name: 'TypeError' })
  }
  const out = await loadRegistryCatalog({ urls, fetchImpl, timeoutMs: 100 })
  assert.equal(out.items, null)
  assert.equal(out.source, 'demo')
  assert.equal(out.attempts.length, 2)
  assert.equal(registryNotice({ items: out.items, attempts: out.attempts }), '远程 registry 暂不可用，已回退演示数据')
})

test('first URL 200 → no later fetch', async () => {
  const urls = ['https://a.example/all.json', 'https://b.example/all.json']
  let calls = 0
  const fetchImpl = async (url) => {
    calls++
    assert.equal(url, urls[0])
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'only' }] }),
    }
  }
  const out = await loadRegistryCatalog({ urls, fetchImpl, timeoutMs: REGISTRY_TIMEOUT_MS })
  assert.equal(calls, 1)
  assert.equal(registryNotice({ items: out.items, attempts: out.attempts }), null)
})

test('invalid body skips URL and tries next', async () => {
  const urls = ['https://a.example/all.json', 'https://b.example/all.json']
  let calls = 0
  const fetchImpl = async (url) => {
    calls++
    if (url === urls[0]) {
      return { ok: true, status: 200, json: async () => ({ notItems: true }) }
    }
    return { ok: true, status: 200, json: async () => ({ items: [{ id: 'b' }] }) }
  }
  const out = await loadRegistryCatalog({ urls, fetchImpl, timeoutMs: REGISTRY_TIMEOUT_MS })
  assert.equal(calls, 2)
  assert.equal(out.items.length, 1)
  assert.equal(out.items[0].id, 'b')
  assert.equal(out.attempts[0].ok, false)
})
