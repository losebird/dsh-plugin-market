// Shared registry fetch order for the shop and the DSH host.
// Shop / Pages copy first so the site works when raw.githubusercontent.com is blocked.
import { collapsePackageOwnerDuplicates } from '../scripts/collapse-package-owner.mjs'

export const SHOP_REGISTRY = 'https://www.dsh-plugin.shop/registry/all.json'
export const RAW_GITHUB_REGISTRY = 'https://raw.githubusercontent.com/losebird/dsh-plugin-market/main/registry/all.json'
export const REGISTRY_TIMEOUT_MS = 8000

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
