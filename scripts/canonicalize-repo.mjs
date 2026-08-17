// Canonical GitHub repo identity for collect.
// Prefer numeric repo id (rename aliases collapse). Fall back to repo string.
// Never key by package first — forks that share an npm name stay separate.
import { compareVersion } from './collapse-package-owner.mjs'

export const normRepo = (fullName) => 'github.com/' + String(fullName).toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
export const normPkg = (name) => String(name).toLowerCase()

export function keyOf(it) {
  if (it && it.githubId != null && it.githubId !== '') return 'ghid:' + it.githubId
  if (it && it.repo) return 'repo:' + normRepo(it.repo)
  if (it && it.package) return 'pkg:' + normPkg(it.package)
  return 'id:' + String((it && it.id) || '').toLowerCase()
}

export function allKeysOf(it) {
  const keys = []
  if (it && it.githubId != null && it.githubId !== '') keys.push('ghid:' + it.githubId)
  if (it && it.repo) keys.push('repo:' + normRepo(it.repo))
  if (it && it.package) keys.push('pkg:' + normPkg(it.package))
  if (it && it.id) keys.push('id:' + String(it.id).toLowerCase())
  for (const a of (it && it.aliases) || []) {
    if (a) keys.push('repo:' + normRepo(a))
  }
  if (it && it.discoveredAs) keys.push('repo:' + normRepo(it.discoveredAs))
  return [...new Set(keys)]
}

export function isAliasDiscovery(repo) {
  const discovered = String((repo && (repo.discoveredAs || repo.full_name)) || '').toLowerCase()
  const canonical = String((repo && repo.full_name) || '').toLowerCase()
  return !!discovered && !!canonical && discovered !== canonical
}

export function applyGithubRepoDetail(repo, detail) {
  if (!repo || !detail) return repo
  if (!repo.discoveredAs) repo.discoveredAs = repo.full_name
  if (detail.full_name && detail.full_name !== repo.full_name) {
    if (!Array.isArray(repo.aliases)) repo.aliases = []
    if (repo.full_name && !repo.aliases.some((a) => String(a).toLowerCase() === String(repo.full_name).toLowerCase())) {
      repo.aliases.push(repo.full_name)
    }
    repo.full_name = detail.full_name
  }
  if (detail.id != null) repo.githubId = detail.id
  if (typeof repo.stars !== 'number' && typeof detail.stargazers_count === 'number') repo.stars = detail.stargazers_count
  if (detail.description != null && !repo.description) repo.description = detail.description
  if (detail.license && detail.license.spdx_id && !repo.license) repo.license = detail.license.spdx_id
  if (Array.isArray(detail.topics) && detail.topics.length > 0) repo.topics = detail.topics
  if (detail.pushed_at && !repo.pushedAt) repo.pushedAt = detail.pushed_at
  return repo
}

export function pickBestPrev(repo, pkgName, prevAuto) {
  if (!repo || !Array.isArray(prevAuto) || prevAuto.length === 0) return undefined
  const owner = String(repo.full_name || '').split('/')[0].toLowerCase()
  const names = new Set(
    [repo.full_name, repo.discoveredAs, ...(repo.aliases || [])]
      .filter(Boolean)
      .map((n) => String(n).toLowerCase()),
  )
  const hits = []
  for (const p of prevAuto) {
    if (!p) continue
    if (repo.githubId != null && p.githubId != null && String(p.githubId) === String(repo.githubId)) {
      hits.push(p)
      continue
    }
    if (p.repo && names.has(String(p.repo).toLowerCase())) {
      hits.push(p)
      continue
    }
    if (pkgName && p.package && String(p.package).toLowerCase() === String(pkgName).toLowerCase()) {
      const po = String(p.repo || '').split('/')[0].toLowerCase()
      if (po && po === owner) hits.push(p)
    }
  }
  if (hits.length === 0) return undefined
  return hits.reduce((best, p) => (compareVersion(p.version, best.version) > 0 ? p : best))
}

export function keepHigherVersion(fetchedTag, prevVersion, prevReleasedAt) {
  if (!prevVersion) return fetchedTag ? { tag_name: fetchedTag.tag_name, published_at: fetchedTag.published_at } : null
  if (!fetchedTag || !fetchedTag.tag_name) return { tag_name: prevVersion, published_at: prevReleasedAt || null }
  if (compareVersion(prevVersion, fetchedTag.tag_name) > 0) {
    return { tag_name: prevVersion, published_at: prevReleasedAt || fetchedTag.published_at || null }
  }
  return fetchedTag
}

export function mergeCandidate(byRepo, fullName, meta = {}) {
  if (!fullName || typeof fullName !== 'string') return null
  const nameKey = 'name:' + fullName.toLowerCase()
  const gid = meta.id != null ? meta.id : meta.githubId
  const idKey = gid != null ? 'id:' + gid : null
  let r = (idKey && byRepo.get(idKey)) || byRepo.get(nameKey)
  const fromApi = meta.topicSourced === true || meta.orgSourced === true || meta.canonical === true
  if (!r) {
    r = { full_name: fullName, aliases: [], discoveredAs: fullName }
    byRepo.set(nameKey, r)
  } else {
    if (!fromApi && fullName.toLowerCase() !== String(r.full_name).toLowerCase()) {
      if (!r.aliases.some((a) => String(a).toLowerCase() === fullName.toLowerCase())) r.aliases.push(fullName)
    }
    byRepo.set(nameKey, r)
  }
  if (idKey) {
    byRepo.set(idKey, r)
    r.githubId = gid
  }
  // Topic / org / explicit GET return the live full_name — prefer it over a stale alias.
  if (meta.topicSourced === true || meta.orgSourced === true || meta.canonical === true) {
    if (r.full_name.toLowerCase() !== fullName.toLowerCase()) {
      if (!r.aliases.some((a) => String(a).toLowerCase() === String(r.full_name).toLowerCase())) r.aliases.push(r.full_name)
    }
    r.full_name = fullName
  }
  if (meta.stars !== undefined) r.stars = meta.stars
  if (meta.description !== undefined) r.description = meta.description
  if (meta.license !== undefined) r.license = meta.license
  if (meta.topics !== undefined) r.topics = meta.topics
  if (meta.topicSourced === true) r.topicSourced = true
  if (meta.orgSourced === true) r.orgSourced = true
  if (meta.pushedAt !== undefined) r.pushedAt = meta.pushedAt
  return r
}

export function uniqueCandidates(byRepo) {
  return [...new Set(byRepo.values())]
}
