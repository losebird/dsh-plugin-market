#!/usr/bin/env node
// DSH 插件市场自动采集器（GitHub Actions 定时运行）
// 来源：① topic 搜索（免鉴权）② code search（GITHUB_TOKEN）③ 上一轮 auto.json 续存
// 校验：package.json 必须声明 dsh.bundle 或 dsh.client 才算插件
// 去重：键 = npm 包名（若有）或规范化 repo URL；curated 覆盖 auto
// 输出：registry/auto.json（纯自动）+ registry/all.json（curated ∪ auto，按 stars 排序）

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = process.env.GITHUB_TOKEN || ''
const TOPICS = ['dsh-plugin', 'dsh-extension', 'deepseek-harness-plugin']

const ghJson = async (path) => {
  const headers = { 'user-agent': 'dsh-plugin-market-collector', accept: 'application/vnd.github+json' }
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  const res = await fetch('https://api.github.com' + path, { headers })
  if (res.status === 403 || res.status === 429) throw new Error('github rate limited: ' + path)
  if (!res.ok) return null
  return res.json()
}

const normRepo = (fullName) => 'github.com/' + String(fullName).toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
const normPkg = (name) => String(name).toLowerCase()
const keyOf = (it) => (it.package ? 'pkg:' + normPkg(it.package) : 'repo:' + normRepo(it.repo))

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 候选收集 ────────────────────────────────────────────────────────────────
async function collectCandidates() {
  const byRepo = new Map()
  const addRepo = (fullName) => {
    if (!fullName || typeof fullName !== 'string') return
    if (!byRepo.has(fullName.toLowerCase())) byRepo.set(fullName.toLowerCase(), { full_name: fullName })
  }
  for (const topic of TOPICS) {
    try {
      const res = await ghJson('/search/repositories?q=' + encodeURIComponent('topic:' + topic + ' fork:false archived:false') + '&sort=stars&per_page=100')
      if (res && Array.isArray(res.items)) {
        for (const it of res.items) {
          addRepo(it.full_name)
          const r = byRepo.get(it.full_name.toLowerCase())
          r.stars = it.stargazers_count
          r.description = it.description || ''
          r.license = it.license && it.license.spdx_id ? it.license.spdx_id : null
          r.topics = it.topics || []
        }
      }
    } catch (e) {
      console.warn('[collect] topic 搜索失败（' + topic + '）: ' + e.message)
    }
    await sleep(800)
  }
  if (TOKEN) {
    try {
      const res = await ghJson('/search/code?q=' + encodeURIComponent('"@deepseek-ai/dsh" filename:package.json') + '&per_page=100')
      if (res && Array.isArray(res.items)) {
        for (const it of res.items) if (it.repository) addRepo(it.repository.full_name)
      }
    } catch (e) {
      console.warn('[collect] code search 失败: ' + e.message)
    }
  } else {
    console.warn('[collect] 未提供 GITHUB_TOKEN，跳过 code search（仅 topic 搜索）')
  }
  return [...byRepo.values()]
}

// ── 单仓库 → 条目 ──────────────────────────────────────────────────────────
async function buildEntry(repo) {
  const [owner, name] = repo.full_name.split('/')
  let pkg = null
  try {
    const raw = await fetch('https://raw.githubusercontent.com/' + repo.full_name + '/HEAD/package.json', { headers: { 'user-agent': 'dsh-plugin-market-collector' } })
    if (raw.ok) pkg = await raw.json()
  } catch {}
  if (!pkg || !pkg.dsh || (!pkg.dsh.bundle && !pkg.dsh.client)) return null

  let releases = null
  try {
    const rel = await ghJson('/repos/' + repo.full_name + '/releases?per_page=30')
    if (Array.isArray(rel)) releases = rel
  } catch {}
  let downloads = 0
  let latest = null
  for (const r of releases || []) {
    if (!latest && !r.draft && !r.prerelease) latest = r
    for (const a of r.assets || []) downloads += a.download_count || 0
  }
  if (!latest && releases && releases.length > 0) latest = releases[0]

  let stars = repo.stars
  let description = repo.description
  let license = repo.license
  let topics = repo.topics || []
  if (typeof stars !== 'number') {
    const detail = await ghJson('/repos/' + repo.full_name)
    if (detail) {
      stars = detail.stargazers_count
      description = description || detail.description
      license = license || (detail.license && detail.license.spdx_id)
      topics = detail.topics || topics
    }
  }

  const spec = latest ? 'github:' + repo.full_name + '#' + latest.tag_name : 'github:' + repo.full_name
  return {
    id: pkg.name ? pkg.name.replace(/^@/, '').replace(/[/.]/g, '-') : name.toLowerCase(),
    name: pkg.name || name,
    type: 'bundle',
    package: pkg.name || null,
    repo: repo.full_name,
    spec: spec,
    version: latest ? latest.tag_name : null,
    author: { name: owner, url: 'https://github.com/' + owner },
    description: pkg.description || description || '',
    tags: topics.slice(0, 8),
    license: license || 'UNKNOWN',
    downloads: downloads,
    stars: stars || 0,
    source: 'auto',
    auto: true,
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const curatedItems = (loadJson('registry/index.json', { items: [] }).items) || []
  const blocklist = (loadJson('registry/blocklist.json', []) || []).map((s) => String(s).toLowerCase())
  const prevAuto = (loadJson('registry/auto.json', { items: [] }).items) || []

  const candidates = await collectCandidates()
  const entries = []
  const seen = new Set()
  for (const repo of candidates) {
    const blocked = blocklist.includes(normRepo(repo.full_name))
    if (blocked) continue
    let entry = null
    try {
      entry = await buildEntry(repo)
    } catch (e) {
      console.warn('[collect] 处理失败 ' + repo.full_name + ': ' + e.message)
    }
    if (!entry) continue
    if (entry.package && blocklist.includes(normPkg(entry.package))) continue
    const key = keyOf(entry)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
    await sleep(200)
  }

  // 上轮存在、本轮未重新发现的条目：查一次 repo 状态，404/私有 → unavailable，否则保留旧数据
  for (const prev of prevAuto) {
    const key = keyOf(prev)
    if (seen.has(key)) continue
    const detail = await ghJson('/repos/' + prev.repo)
    if (detail === null) {
      entries.push({ ...prev, status: 'unavailable' })
      console.warn('[collect] 标记 unavailable: ' + prev.repo)
    } else {
      entries.push(prev)
    }
    await sleep(200)
  }

  // curated 覆盖 auto（按包名/repo 键），all = curated ∪ auto-only
  const curatedKeys = new Set(curatedItems.map(keyOf))
  const autoOnly = entries.filter((e) => !curatedKeys.has(keyOf(e)))
  const all = [...curatedItems, ...autoOnly]
  all.sort((a, b) => (b.stars || 0) - (a.stars || 0))

  writeFileSync(join(ROOT, 'registry/auto.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: entries }, null, 2))
  writeFileSync(join(ROOT, 'registry/all.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: all }, null, 2))
  console.log('[collect] curated=' + curatedItems.length + ' auto=' + entries.length + ' merged=' + all.length)
}

main().catch((e) => {
  console.error('[collect] 运行失败: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
