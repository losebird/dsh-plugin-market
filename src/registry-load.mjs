// Shared registry fetch order for the shop and the DSH host.
// Shop / Pages copy first so the site works when raw.githubusercontent.com is blocked.
import { collapsePackageOwnerDuplicates } from '../scripts/collapse-package-owner.mjs'

export const SHOP_REGISTRY = 'https://www.dsh-plugin.shop/registry/all.json'
export const RAW_GITHUB_REGISTRY = 'https://raw.githubusercontent.com/losebird/dsh-plugin-market/main/registry/all.json'
export const REGISTRY_TIMEOUT_MS = 8000
export const LIST_CLIENT_TIMEOUT_MS = 20000 // 2×8s sources + parse budget
export const CURATED_TIMEOUT_MS = 8000

export function registryUrls(options = {}) {
  const out = []
  const add = (url) => {
    if (typeof url !== 'string') return
    const trimmed = url.trim()
    if (!trimmed) return
    if (!out.includes(trimmed)) out.push(trimmed)
  }
  add(options.envUrl)
  if (options.pagesUrl) add(options.pagesUrl)
  else add(SHOP_REGISTRY)
  add(RAW_GITHUB_REGISTRY)
  return out
}

export function pickRegistryItems(parsed) {
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  return null
}

export function catalogFromParsed(parsed) {
  const items = pickRegistryItems(parsed)
  if (!items) return null
  return collapsePackageOwnerDuplicates(items, { preferCurated: true })
}

export function attemptErrorMessage(error) {
  if (!error) return 'unknown'
  const name = error.name || ''
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout'
  const msg = error.message || String(error)
  if (/timed?\s*out|timeout/i.test(msg)) return 'timeout'
  return msg
}

const REGISTRY_NOTICE_DEMO = '远程 registry 暂不可用，已回退演示数据'
const REGISTRY_NOTICE_FALLBACK = '首选源不可用，已改用备用源'

export function registryNotice({ items, attempts }) {
  if (!items) return REGISTRY_NOTICE_DEMO
  if (!attempts || attempts.length === 0) return null
  const firstOk = attempts.findIndex((a) => a.ok)
  if (firstOk > 0) return REGISTRY_NOTICE_FALLBACK
  return null
}

export async function loadRegistryCatalog({
  urls,
  fetchImpl = fetch,
  timeoutMs = REGISTRY_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const sourceList = urls ?? registryUrls({ envUrl: typeof process !== 'undefined' && process.env ? process.env.DSH_MARKET_REGISTRY : undefined })
  const attempts = []
  for (const url of sourceList) {
    const start = now()
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      const ms = now() - start
      if (!res.ok) {
        attempts.push({ url, ok: false, status: res.status, error: 'HTTP ' + res.status, ms })
        continue
      }
      let parsed
      try {
        parsed = await res.json()
      } catch (e) {
        attempts.push({ url, ok: false, status: res.status, error: attemptErrorMessage(e), ms: now() - start })
        continue
      }
      const got = catalogFromParsed(parsed)
      if (got) {
        attempts.push({ url, ok: true, status: res.status, error: null, ms })
        return { items: got, source: 'remote', attempts }
      }
      attempts.push({ url, ok: false, status: res.status, error: 'invalid body', ms })
    } catch (e) {
      attempts.push({ url, ok: false, status: null, error: attemptErrorMessage(e), ms: now() - start })
    }
  }
  return { items: null, source: 'demo', attempts }
}