// Collapse renamed-repo duplicates: same npm package + same GitHub owner → one row.
// Browser-safe (no node: imports). Used by collect, the website, and tests.
// Different owners that happen to share a package name (e.g. orriduck/dsh-tui vs
// xiaoshihou514/dsh-tui) are never merged. Items without a package are never merged.

export function ownerOf(item) {
  const owner = String(item && item.repo ? item.repo : '').split('/')[0]
  return owner ? owner.toLowerCase() : ''
}

export function packageOwnerKey(item) {
  const pkg = item && item.package ? String(item.package).toLowerCase() : ''
  const owner = ownerOf(item)
  if (!pkg || !owner) return null
  return pkg + '\0' + owner
}

export function cardKey(item) {
  return (item && (item.repo || item.package || item.id)) || ''
}

function versionTuple(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
}

export function compareVersion(a, b) {
  const ta = versionTuple(a)
  const tb = versionTuple(b)
  if (!ta && !tb) return 0
  if (!ta) return -1
  if (!tb) return 1
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i]
  }
  return 0
}

function compareReleasedAt(a, b) {
  const da = Date.parse(a || '')
  const db = Date.parse(b || '')
  const aOk = Number.isFinite(da)
  const bOk = Number.isFinite(db)
  if (!aOk && !bOk) return 0
  if (!aOk) return -1
  if (!bOk) return 1
  return da - db
}

function packageLeaf(pkg) {
  const s = String(pkg || '')
  return (s.includes('/') ? s.slice(s.lastIndexOf('/') + 1) : s).toLowerCase()
}

function repoLeaf(repo) {
  return String(repo || '').split('/')[1] || ''
}

export function repoMatchScore(item) {
  const repo = repoLeaf(item && item.repo).toLowerCase()
  const pkg = packageLeaf(item && item.package)
  if (!repo || !pkg) return 0
  if (repo === pkg) return 3
  const strip = (s) => s.replace(/[-_.]/g, '')
  if (strip(repo) === strip(pkg)) return 2
  if (repo.includes(pkg) || pkg.includes(repo)) return 1
  return 0
}

// true if candidate should replace current as the kept row
export function isBetterDuplicate(candidate, current, preferCurated = false) {
  if (preferCurated) {
    const aCur = candidate && candidate.source === 'curated'
    const bCur = current && current.source === 'curated'
    if (aCur !== bCur) return aCur
  }
  const stars = (candidate.stars || 0) - (current.stars || 0)
  if (stars !== 0) return stars > 0
  const ver = compareVersion(candidate.version, current.version)
  if (ver !== 0) return ver > 0
  const released = compareReleasedAt(candidate.releasedAt, current.releasedAt)
  if (released !== 0) return released > 0
  const match = repoMatchScore(candidate) - repoMatchScore(current)
  if (match !== 0) return match > 0
  return false
}

export function collapsePackageOwnerDuplicates(items, options = {}) {
  const { log, preferCurated = false } = options
  if (!Array.isArray(items)) return []
  if (items.length < 2) return items.slice()

  const winnerIdx = new Map()
  for (let i = 0; i < items.length; i++) {
    const key = packageOwnerKey(items[i])
    if (!key) continue
    if (!winnerIdx.has(key)) {
      winnerIdx.set(key, i)
      continue
    }
    const j = winnerIdx.get(key)
    const winner = items[j]
    const candidate = items[i]
    if (isBetterDuplicate(candidate, winner, preferCurated)) {
      if (typeof log === 'function') {
        log('[collect] drop renamed duplicate ' + winner.repo + ' (same package ' + candidate.package + ' as ' + candidate.repo + ')')
      }
      winnerIdx.set(key, i)
    } else if (typeof log === 'function') {
      log('[collect] drop renamed duplicate ' + candidate.repo + ' (same package ' + winner.package + ' as ' + winner.repo + ')')
    }
  }

  const keep = new Set(winnerIdx.values())
  return items.filter((it, i) => {
    const key = packageOwnerKey(it)
    return !key || keep.has(i)
  })
}
