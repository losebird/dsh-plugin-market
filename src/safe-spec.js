// Shared one-click install guards. Host, collector, and README renderer
// must agree: only npm names and https tgz/zip URLs are executable.

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const NPM_NAME_RE = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[0-9][a-z0-9._-]*)?$/i
const TGZ_URL_RE = /^https:\/\/[^\s'"]+\.tgz$/i
const PACK_URL_RE = /^https:\/\/[^\s'"]+$/i

export function isMarketId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && ID_RE.test(id)
}

export function isNpmName(spec) {
  if (typeof spec !== 'string' || spec.length === 0 || spec.length > 214) return false
  if (/[\s'"\\]/.test(spec)) return false
  if (/^(github:|git\+|https?:|file:)/i.test(spec)) return false
  return NPM_NAME_RE.test(spec)
}

export function isTgzUrl(spec) {
  return typeof spec === 'string' && spec.length < 2000 && TGZ_URL_RE.test(spec)
}

export function isPackUrl(spec) {
  return typeof spec === 'string' && spec.length < 2000 && PACK_URL_RE.test(spec)
}

export function isSafeBundleSpec(spec) {
  return isNpmName(spec) || isTgzUrl(spec)
}

export function safeBundleSpec(item) {
  if (!item || item.type !== 'bundle') return null
  if (item.status === 'unavailable') return null
  if (item.verified === false) return null
  if (isSafeBundleSpec(item.spec)) return item.spec
  if (isNpmName(item.package)) return item.package
  return null
}

export function canOneClick(item) {
  if (!item || item.status === 'unavailable') return false
  if (item.type === 'pack') return isPackUrl(item.spec)
  return !!safeBundleSpec(item)
}

export function tgzAssetUrl(release) {
  if (!release || !Array.isArray(release.assets)) return null
  for (const a of release.assets) {
    const url = a && a.browser_download_url
    if (isTgzUrl(url)) return url
  }
  return null
}
