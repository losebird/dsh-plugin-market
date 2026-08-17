#!/usr/bin/env node
// 补漏脚本：把官方组织（omdsh-dev 等）里尚未收录的仓库补进 auto.json / all.json。
// 完全不使用 GitHub REST API（避免限流）：仓库列表抓取 org 页面 HTML，
// 条目构建只走 raw.githubusercontent（package.json + README 安装方式识别）。
// 版本/下载量等富数据由每日 Actions 全量采集（带 token）自动补齐。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectInstallFromReadme, loadCuratedItems } from './collect.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORGS = ['omdsh-dev']

const normRepo = (fullName) => 'github.com/' + String(fullName).toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
const normPkg = (name) => String(name).toLowerCase()
const keyOf = (it) => (it.repo ? 'repo:' + normRepo(it.repo) : (it.package ? 'pkg:' + normPkg(it.package) : 'id:' + String(it.id || '').toLowerCase()))

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

async function orgReposFromHtml(org) {
  const repos = new Set()
  for (let page = 1; page <= 10; page++) {
    const res = await fetch('https://github.com/orgs/' + org + '/repositories?type=all&page=' + page, {
      headers: { 'user-agent': 'Mozilla/5.0 dsh-plugin-market-fill-gaps' },
    })
    if (!res.ok) break
    const html = await res.text()
    const re = new RegExp('href="/' + org + '/([A-Za-z0-9_.-]+)"', 'g')
    let m
    let found = 0
    while ((m = re.exec(html))) {
      repos.add(org + '/' + m[1])
      found++
    }
    if (found === 0) break
  }
  return [...repos]
}

const fetchRaw = async (url) => {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'dsh-plugin-market-collector' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

async function buildLightEntry(fullName, takenIds) {
  const [, name] = fullName.split('/')
  let pkg = null
  try {
    const raw = await fetchRaw('https://raw.githubusercontent.com/' + fullName + '/HEAD/package.json')
    if (raw) pkg = JSON.parse(raw)
  } catch {}
  let readme = null
  for (const f of ['README.md', 'readme.md']) {
    readme = await fetchRaw('https://raw.githubusercontent.com/' + fullName + '/HEAD/' + f)
    if (readme) break
  }
  let install = detectInstallFromReadme(readme)
  if (!install) install = { method: 'manual', source: 'readme' }
  const verified = !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch)
  const baseId = pkg && pkg.name ? pkg.name.replace(/^@/, '').replace(/[/.]/g, '-') : name.toLowerCase()
  let id = baseId
  let n = 2
  while (takenIds.has(id)) id = baseId + '-' + name.toLowerCase()
  takenIds.add(id)
  return {
    id,
    name: (pkg && pkg.name) || name,
    type: 'bundle',
    package: (pkg && pkg.name) || null,
    repo: fullName,
    spec: 'github:' + fullName,
    version: (pkg && pkg.version) || null,
    author: { name: fullName.split('/')[0], url: 'https://github.com/' + fullName.split('/')[0] },
    description: (pkg && pkg.description) || name,
    tags: [],
    license: (pkg && pkg.license) || 'UNKNOWN',
    downloads: 0,
    stars: 0,
    releasedAt: null,
    topicSourced: false,
    verified,
    install,
    source: 'auto',
    auto: true,
    category: 'other',
  }
}

async function main() {
  const auto = (loadJson('registry/auto.json', { items: [] }).items) || []
  const curated = loadCuratedItems()
  const have = new Set(auto.map((i) => (i.repo ? i.repo.toLowerCase() : '')))
  const takenIds = new Set([...auto, ...curated].map((i) => String(i.id || '').toLowerCase()))
  const added = []
  for (const org of ORGS) {
    const repos = await orgReposFromHtml(org)
    console.log('[fill-gaps] 组织 ' + org + ' 页面提取 ' + repos.length + ' 个仓库')
    for (const full of repos) {
      if (have.has(full.toLowerCase())) continue
      try {
        const entry = await buildLightEntry(full, takenIds)
        auto.push(entry)
        added.push(entry)
        console.log('[fill-gaps] 新增: ' + entry.repo + ' (id=' + entry.id + ', install=' + entry.install.method + ')')
      } catch (e) {
        console.warn('[fill-gaps] 处理失败 ' + full + ': ' + e.message)
      }
    }
  }
  if (added.length === 0) {
    console.log('[fill-gaps] 没有缺失仓库')
    return
  }
  const curatedKeys = new Set(curated.map(keyOf))
  const autoOnly = auto.filter((e) => !curatedKeys.has(keyOf(e)))
  const all = [...curated, ...autoOnly]
  all.sort((a, b) => (b.stars || 0) - (a.stars || 0))
  writeFileSync(join(ROOT, 'registry/auto.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: auto }, null, 2))
  writeFileSync(join(ROOT, 'registry/all.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: all }, null, 2))
  console.log('[fill-gaps] 完成: 新增 ' + added.length + ' 个，auto=' + auto.length + ' merged=' + all.length)
}

main().catch((e) => {
  console.error('[fill-gaps] 失败: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
