#!/usr/bin/env node
// DSH 插件市场自动采集器（GitHub Actions 定时运行）
// 来源：① topic 搜索（免鉴权）② code search（GITHUB_TOKEN）③ awesome 列表 README 链接
//       ④ 组织仓库列表 ⑤ 上一轮 auto.json 续存
// 校验：verified 采用官方判据 dsh.bundle.patch（与 dsh plugin add 一致）；
//       topic 来源仓库即使无声明也收录并标 verified: false
// 去重：键 = npm 包名（若有）或规范化 repo URL；curated 覆盖 auto；跨源共享同一候选表
// 分类：按功能分类器给每个条目打 category（curated 可显式声明），噪声 topic 标签一律过滤
// 输出：registry/auto.json（纯自动）+ registry/all.json（curated ∪ auto，按 stars 排序）

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = process.env.GITHUB_TOKEN || ''

// ── 采集源配置 ──────────────────────────────────────────────────────────────
const TOPICS = ['dsh-plugin', 'dsh-extension', 'deepseek-harness-plugin']
const AWESOME_LISTS = ['Dominic789654/awesome-deepseek-harness', 'awesome-dsh-plugin/awesome-dsh-plugin']
const ORGS = ['omdsh-dev']
const CODE_SEARCH_PAGES = 3 // 每页 100，最多 300 个 code search 命中
const TOPIC_PAGES = 2 // 每页 100；按星标只取头部高价值项目，采集快且不易限流

// 噪声标签：生态关键词，不做功能分类展示
const NOISE_TAGS = new Set([
  'dsh-plugin', 'deepseek-harness', 'deepseek-harness-plugin', 'dsh', 'deepseek',
  'dsh-plugins', 'deepseek-harness-plugins', 'ai-agents', 'claude-code', 'cordis',
  'ai-agent', 'agent-skills', 'ai', 'agents', 'llm', 'plugin', 'plugins',
  'deepseek-ai', 'awesome', 'harness', 'artificial-intelligence',
])

// ── 功能分类器（按顺序首个命中；curated 显式声明优先） ───────────────────────
const CATEGORY_RULES = [
  { key: 'tools', re: /stock|股票|行情|quant|trading|kline|财经|基金/ }, // 金融行情优先于 market 关键词
  { key: 'market', re: /market|marketplace|插件市场|插件中心|store|installer/ },
  { key: 'ui', re: /\bui\b|skin|theme|sidebar|transparent|view.?mode|appearance|界面|主题|皮肤|美化|style|brand/ },
  { key: 'session', re: /session|memory|archive|history|delete|会话|记忆|存档|context|compaction/ },
  { key: 'agent', re: /agent|team|workflow|task|swarm|subagent|auto.?mode|编排|multi.?agent/ },
  { key: 'comm', re: /telegram|messag|notify|mobile|pwa|pocket|relay|voice|wechat|\bim\b|im-|微信|提醒|通知/ },
  { key: 'auth', re: /auth|approval|permission|oauth|gate|audit|balance|subscription|login|安全|权限|计费/ },
  { key: 'fun', re: /\bfun\b|\bpet\b|girl|companion|persona|entertain|陪伴|宠物|角色|娱乐/ },
  { key: 'skills', re: /skill|技能|能力包/ },
  { key: 'tools', re: /mcp|browser|playwright|computer.?use|file|preview|vision|office|manim|xcode|path|workspace|tool|pdf|image|screen|email/ },
  { key: 'dev', re: /code|provider|model|language|translat|prompt|draft|cli|tui|input|smart|genui|repl|debug/ },
]

function categorize(entry) {
  if (typeof entry.category === 'string' && entry.category.length > 0) return entry.category
  const hay = [entry.name, entry.description, (entry.tags || []).join(' ')].join(' ').toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(hay)) return rule.key
  }
  return 'other'
}

const ghJson = async (path) => {
  const headers = { 'user-agent': 'dsh-plugin-market-collector', accept: 'application/vnd.github+json' }
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.github.com' + path, { headers })
    if ((res.status === 403 || res.status === 429) && attempt === 0) {
      console.warn('[collect] 限流，30s 后退避重试: ' + path)
      await sleep(30000)
      continue
    }
    if (res.status === 403 || res.status === 429) throw new Error('github rate limited: ' + path)
    if (!res.ok) return null
    return res.json()
  }
  return null
}

const normRepo = (fullName) => 'github.com/' + String(fullName).toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
const normPkg = (name) => String(name).toLowerCase()
const keyOf = (it) => (it.package ? 'pkg:' + normPkg(it.package) : 'repo:' + normRepo(it.repo))
const cleanTags = (tags) => (tags || [])
  .map((t) => String(t).trim())
  .filter((t) => t.length > 0 && t.length <= 32 && !NOISE_TAGS.has(t.toLowerCase()))
  .slice(0, 8)

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 候选收集（所有来源汇入同一张按 repo 去重的表） ───────────────────────────
async function collectCandidates() {
  const byRepo = new Map()
  const addRepo = (fullName, meta = {}) => {
    if (!fullName || typeof fullName !== 'string') return
    const key = fullName.toLowerCase()
    if (!byRepo.has(key)) byRepo.set(key, { full_name: fullName })
    const r = byRepo.get(key)
    if (meta.stars !== undefined) r.stars = meta.stars
    if (meta.description !== undefined) r.description = meta.description
    if (meta.license !== undefined) r.license = meta.license
    if (meta.topics !== undefined) r.topics = meta.topics
    if (meta.topicSourced === true) r.topicSourced = true
    if (meta.pushedAt !== undefined) r.pushedAt = meta.pushedAt
  }

  // ① topic 搜索：只取星标榜头部（top 200/主题），高价值优先、采集快
  for (const topic of TOPICS) {
    for (let page = 1; page <= TOPIC_PAGES; page++) {
      try {
        const res = await ghJson('/search/repositories?q=' + encodeURIComponent('topic:' + topic + ' fork:false archived:false') + '&sort=stars&per_page=100&page=' + page)
        if (!res || !Array.isArray(res.items)) break
        for (const it of res.items) {
          addRepo(it.full_name, {
            stars: it.stargazers_count,
            description: it.description || '',
            license: it.license && it.license.spdx_id ? it.license.spdx_id : null,
            topics: it.topics || [],
            topicSourced: true,
            pushedAt: it.pushed_at || null,
          })
        }
        if (res.items.length < 100) break
      } catch (e) {
        console.warn('[collect] topic 搜索失败（' + topic + ' p' + page + '）: ' + e.message)
        break
      }
      await sleep(800)
    }
  }

  // ② code search（依赖 @deepseek-ai/dsh 包的都是候选）
  if (TOKEN) {
    for (let page = 1; page <= CODE_SEARCH_PAGES; page++) {
      try {
        const res = await ghJson('/search/code?q=' + encodeURIComponent('"@deepseek-ai/dsh" filename:package.json') + '&per_page=100&page=' + page)
        if (!res || !Array.isArray(res.items)) break
        for (const it of res.items) if (it.repository) addRepo(it.repository.full_name)
        if (res.items.length < 100) break
      } catch (e) {
        console.warn('[collect] code search 失败: ' + e.message)
        break
      }
      await sleep(800)
    }
  } else {
    console.warn('[collect] 未提供 GITHUB_TOKEN，跳过 code search')
  }

  // ③ awesome 列表：README 里的 GitHub 仓库链接
  for (const list of AWESOME_LISTS) {
    try {
      const res = await fetch('https://raw.githubusercontent.com/' + list + '/HEAD/README.md', { headers: { 'user-agent': 'dsh-plugin-market-collector' } })
      if (!res.ok) { console.warn('[collect] awesome 列表读取失败: ' + list); continue }
      const text = await res.text()
      const re = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g
      let m
      let count = 0
      while ((m = re.exec(text)) !== null) {
        const full = m[1] + '/' + m[2]
        // 跳过列表仓库自身与 GitHub 官方页
        if (AWESOME_LISTS.some((l) => l.toLowerCase() === full.toLowerCase() || l.toLowerCase().startsWith(full.toLowerCase() + '/'))) continue
        if (full === 'deepseek-ai/deepseek-harness') continue
        addRepo(full)
        count++
      }
      console.log('[collect] awesome 列表 ' + list + ' 提取 ' + count + ' 个仓库链接')
    } catch (e) {
      console.warn('[collect] awesome 列表处理失败: ' + list + ' ' + e.message)
    }
    await sleep(300)
  }

  // ④ 组织仓库列表
  for (const org of ORGS) {
    try {
      const res = await ghJson('/orgs/' + org + '/repos?per_page=100')
      if (Array.isArray(res)) {
        for (const r of res) addRepo(r.full_name, { pushedAt: r.pushed_at || null })
        console.log('[collect] 组织 ' + org + ' 收录 ' + res.length + ' 个仓库')
      }
    } catch (e) {
      console.warn('[collect] 组织仓库读取失败: ' + org + ' ' + e.message)
    }
    await sleep(300)
  }

  return [...byRepo.values()]
}

// ── 单仓库 → 条目 ──────────────────────────────────────────────────────────
// verified 采用官方判据：package.json 里声明了 dsh.bundle.patch（与 dsh plugin
// add 的挂载判定 exportsPatch 一致）。topic 来源的仓库即使无声明也收录，
// 标 verified: false（未验证，禁用一键安装）。
// 上一轮已有数据的仓库直接复用版本/下载量/spec，跳过 releases 调用（省配额）。
async function buildEntry(repo, prev) {
  const [, name] = repo.full_name.split('/')
  let pkg = null
  try {
    const raw = await fetch('https://raw.githubusercontent.com/' + repo.full_name + '/HEAD/package.json', { headers: { 'user-agent': 'dsh-plugin-market-collector' } })
    if (raw.ok) pkg = await raw.json()
  } catch {}
  const hasDshSignal = !!(pkg && pkg.dsh && (pkg.dsh.bundle || pkg.dsh.client))
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {}
  const hasDshDep = Object.keys(deps).some((k) => k.startsWith('@deepseek-ai/dsh'))
  if (!repo.topicSourced && !hasDshSignal && !hasDshDep) return null
  const verified = !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch)

  const reuse = prev && prev.repo && prev.repo.toLowerCase() === repo.full_name.toLowerCase() && prev.status !== 'unavailable'

  let latest = null
  let downloads = 0
  if (reuse && typeof prev.version === 'string') {
    latest = { tag_name: prev.version }
    downloads = typeof prev.downloads === 'number' ? prev.downloads : 0
  } else if (pkg) {
    try {
      const rel = await ghJson('/repos/' + repo.full_name + '/releases?per_page=30')
      const releases = Array.isArray(rel) ? rel : []
      for (const r of releases) {
        if (!latest && !r.draft && !r.prerelease) latest = r
        for (const a of r.assets || []) downloads += a.download_count || 0
      }
      if (!latest && releases.length > 0) latest = releases[0]
    } catch (e) {
      console.warn('[collect] releases 获取失败（继续）: ' + repo.full_name)
    }
  }

  let stars = repo.stars
  let description = repo.description
  let license = repo.license
  let topics = repo.topics || []
  if (reuse) {
    description = description || prev.description
    license = license || prev.license
    topics = topics.length > 0 ? topics : (Array.isArray(prev.tags) ? prev.tags : [])
  }
  if (typeof stars !== 'number') {
    try {
      const detail = await ghJson('/repos/' + repo.full_name)
      if (detail) {
        stars = detail.stargazers_count
        description = description || detail.description
        license = license || (detail.license && detail.license.spdx_id)
        topics = detail.topics || topics
      }
    } catch (e) {
      console.warn('[collect] repo 详情获取失败（继续）: ' + repo.full_name)
    }
  }

  const spec = latest ? 'github:' + repo.full_name + '#' + latest.tag_name : 'github:' + repo.full_name
  const owner = repo.full_name.split('/')[0]
  const releasedAt = (latest && latest.published_at) || repo.pushedAt || (reuse && prev.releasedAt) || null
  const entry = {
    id: pkg && pkg.name ? pkg.name.replace(/^@/, '').replace(/[/.]/g, '-') : name.toLowerCase(),
    name: (pkg && pkg.name) || name,
    type: 'bundle',
    package: (pkg && pkg.name) || null,
    repo: repo.full_name,
    spec: spec,
    version: latest ? latest.tag_name : null,
    author: { name: owner, url: 'https://github.com/' + owner },
    description: (pkg && pkg.description) || description || '',
    tags: cleanTags(topics),
    license: license || 'UNKNOWN',
    downloads: downloads,
    stars: stars || 0,
    releasedAt: releasedAt,
    verified: verified,
    source: 'auto',
    auto: true,
  }
  entry.category = categorize(entry)
  return entry
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const curatedItems = (loadJson('registry/index.json', { items: [] }).items) || []
  const blocklist = (loadJson('registry/blocklist.json', []) || []).map((s) => String(s).toLowerCase())
  const prevAuto = (loadJson('registry/auto.json', { items: [] }).items) || []

  const candidates = await collectCandidates()
  const prevByRepo = new Map(prevAuto.map((p) => [normRepo(p.repo), p]))
  const entries = []
  const seen = new Set()
  for (const repo of candidates) {
    if (blocklist.includes(normRepo(repo.full_name))) continue
    let entry = null
    try {
      entry = await buildEntry(repo, prevByRepo.get(normRepo(repo.full_name)))
    } catch (e) {
      console.warn('[collect] 处理失败 ' + repo.full_name + ': ' + e.message)
    }
    if (!entry) continue
    if (entry.package && blocklist.includes(normPkg(entry.package))) continue
    const key = keyOf(entry)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
    await sleep(400)
  }

  // 上轮存在、本轮未重新发现的条目：查一次 repo 状态，404/私有 → unavailable，限流/异常 → 保留原数据
  for (const prev of prevAuto) {
    const key = keyOf(prev)
    if (seen.has(key)) continue
    let detail = null
    try {
      detail = await ghJson('/repos/' + prev.repo)
    } catch (e) {
      console.warn('[collect] 状态检查限流，保留原条目: ' + prev.repo)
    }
    if (detail === undefined) {
      entries.push(prev)
    } else if (detail === null) {
      entries.push({ ...prev, status: 'unavailable' })
      console.warn('[collect] 标记 unavailable: ' + prev.repo)
    } else {
      entries.push(prev)
    }
    await sleep(400)
  }

  // curated 覆盖 auto（按包名/repo 键），all = curated ∪ auto-only
  const curatedKeys = new Set(curatedItems.map(keyOf))
  const autoOnly = entries.filter((e) => !curatedKeys.has(keyOf(e)))
  const all = [...curatedItems, ...autoOnly]
  for (const it of all) {
    it.category = categorize(it)
    if (Array.isArray(it.tags)) it.tags = cleanTags(it.tags)
    if (!('verified' in it)) it.verified = true
  }
  all.sort((a, b) => (b.stars || 0) - (a.stars || 0))

  writeFileSync(join(ROOT, 'registry/auto.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: entries }, null, 2))
  writeFileSync(join(ROOT, 'registry/all.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: all }, null, 2))
  const byCat = {}
  for (const it of all) byCat[it.category] = (byCat[it.category] || 0) + 1
  console.log('[collect] curated=' + curatedItems.length + ' auto=' + entries.length + ' merged=' + all.length)
  console.log('[collect] 分类分布: ' + JSON.stringify(byCat))
}

main().catch((e) => {
  console.error('[collect] 运行失败: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
