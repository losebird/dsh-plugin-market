#!/usr/bin/env node
// DSH 插件市场自动采集器（GitHub Actions 定时运行）
// 来源：① topic 搜索（免鉴权）② code search（GITHUB_TOKEN）③ awesome 列表 README 链接
//       ④ 组织仓库列表 ⑤ 上一轮 auto.json 续存
// 校验：verified 采用官方判据 dsh.bundle.patch（与 dsh plugin add 一致）；
//       topic 来源仓库即使无声明也收录并标 verified: false
// 去重：优先 GitHub 仓库数字 id（rename alias 合并），否则规范化 repo；无仓库才退回包名。
//       切勿全局按包名去重（不同 owner 的同名 fork 必须分开）。curated 覆盖 auto。
// 分类：按功能分类器给每个条目打 category（curated 可显式声明），噪声 topic 标签一律过滤
// 输出：registry/auto.json（纯自动）+ registry/all.json（curated ∪ auto，按 stars 排序）
// curated 来源：registry/index.json ∪ registry/curated/*.json

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collapsePackageOwnerDuplicates, compareVersion } from './collapse-package-owner.mjs'
import {
  normRepo, normPkg, keyOf, allKeysOf,
  applyGithubRepoDetail, pickBestPrev, keepHigherVersion, isAliasDiscovery,
  mergeCandidate, uniqueCandidates,
} from './canonicalize-repo.mjs'

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

export function categorize(entry) {
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

export { keyOf, normRepo }
const cleanTags = (tags) => (tags || [])
  .map((t) => String(t).trim())
  .filter((t) => t.length > 0 && t.length <= 32 && !NOISE_TAGS.has(t.toLowerCase()))
  .slice(0, 8)

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

export function loadCuratedItems(root = ROOT) {
  const indexPath = join(root, 'registry/index.json')
  let indexItems = []
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(readFileSync(indexPath, 'utf8'))
      indexItems = data.items || []
    } catch {}
  }
  const byKey = new Map()
  for (const it of indexItems) byKey.set(keyOf(it), it)
  const curatedDir = join(root, 'registry/curated')
  if (existsSync(curatedDir)) {
    for (const file of readdirSync(curatedDir).filter((f) => f.endsWith('.json')).sort()) {
      try {
        const it = JSON.parse(readFileSync(join(curatedDir, file), 'utf8'))
        if (!it || typeof it !== 'object' || Array.isArray(it)) continue
        byKey.set(keyOf(it), it)
      } catch {}
    }
  }
  return [...byKey.values()]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 候选收集（所有来源汇入同一张按 repo 去重的表） ───────────────────────────
async function collectCandidates() {
  const byRepo = new Map()
  const addRepo = (fullName, meta = {}) => mergeCandidate(byRepo, fullName, meta)

  // ① topic 搜索：只取星标榜头部（top 200/主题），高价值优先、采集快
  for (const topic of TOPICS) {
    for (let page = 1; page <= TOPIC_PAGES; page++) {
      try {
        const res = await ghJson('/search/repositories?q=' + encodeURIComponent('topic:' + topic + ' fork:false archived:false') + '&sort=stars&per_page=100&page=' + page)
        if (!res || !Array.isArray(res.items)) break
        for (const it of res.items) {
          addRepo(it.full_name, {
            id: it.id,
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
        for (const it of res.items) {
          if (it.repository) addRepo(it.repository.full_name, { id: it.repository.id })
        }
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

  // ④ 组织仓库列表（org 成员身份本身即 DSH 相关性信号）
  for (const org of ORGS) {
    try {
      const res = await ghJson('/orgs/' + org + '/repos?per_page=100')
      if (Array.isArray(res)) {
        for (const r of res) addRepo(r.full_name, {
          id: r.id,
          pushedAt: r.pushed_at || null,
          orgSourced: true,
          stars: r.stargazers_count || 0,
          description: r.description || '',
          license: r.license && r.license.spdx_id ? r.license.spdx_id : null,
          topics: r.topics || [],
        })
        console.log('[collect] 组织 ' + org + ' 收录 ' + res.length + ' 个仓库')
      }
    } catch (e) {
      console.warn('[collect] 组织仓库读取失败: ' + org + ' ' + e.message)
    }
    await sleep(300)
  }

  return uniqueCandidates(byRepo)
}

// ── README 安装方式识别 ──────────────────────────────────────────────────────
// 从项目 README 提取官方安装方式，优先于包特征启发式：
// script（curl|bash、irm|iex，按 OS 记录命令）> dsh plugin add > npm -g > git clone
// 先取“安装”类章节内查找；章节内找不到再全文（此时脚本 URL 必须指向
// raw.githubusercontent 的 .sh/.ps1，防止把 nvm 之类的开发环境脚本误当安装方式）
export function installSection(readme) {
  const heads = []
  const re = /^#{1,4}\s+(.+)$/gm
  let m
  while ((m = re.exec(readme))) heads.push({ idx: m.index, text: m[1] })
  for (let i = 0; i < heads.length; i++) {
    if (/install|安装|quick ?start|快速开始|getting started|deploy|部署|setup/i.test(heads[i].text)) {
      return readme.slice(heads[i].idx, i + 1 < heads.length ? heads[i + 1].idx : readme.length)
    }
  }
  return null
}
// 全部“安装类”章节（按出现顺序），排除未来/规划类标题（如 “Target installation experience”
// 这种尚未实现的安装方式，不能当作真实安装方法）
export function installSections(readme) {
  const heads = []
  const re = /^#{1,4}\s+(.+)$/gm
  let m
  while ((m = re.exec(readme))) heads.push({ idx: m.index, text: m[1] })
  const out = []
  for (let i = 0; i < heads.length; i++) {
    if (!/install|安装|quick ?start|快速开始|getting started|deploy|部署|setup/i.test(heads[i].text)) continue
    if (/target|roadmap|plan(?:ned)?|future|todo|wishlist|即将|未来|规划|愿景/i.test(heads[i].text)) continue
    out.push({ text: heads[i].text, content: readme.slice(heads[i].idx, i + 1 < heads.length ? heads[i + 1].idx : readme.length) })
  }
  return out
}
// dsh plugin add 的 spec 校验：只认“可远程安装”的目标（github:/git+/https 或 npm 包名）。
// 本地 tarball（/path/x.tgz、./x.tgz、file:、~ 开头）说明项目要求自行构建后本地安装，
// 这类不能一键装，必须拒绝。
function validAddArg(arg) {
  if (/^(github:|git\+https?:\/\/|https?:\/\/)/i.test(arg)) return true
  if (/^file:|^[./~]|\.(?:tgz|tar\.gz)$/i.test(arg)) return false
  return /^@?[\w.-]+(?:\/[\w.-]+)?$/.test(arg)
}
export function detectInstallFromReadme(readme) {
  if (typeof readme !== 'string' || readme.length < 40) return null
  const sections = installSections(readme)
  // 有安装章节 → 只在这些章节内识别（避免把开发/规划章节误当安装方式）；无章节 → 全文兜底
  const scopes = sections.length > 0 ? sections.map((s) => s.content) : [readme]
  // 0) “交给你的 AI 安装”式项目（如 modlens：按 INSTALL.md 由 agent 执行，安装章节里的
  //    curl 往往是可选引擎/附属步骤而非主安装方式）→ 归为 manual，市场点安装交给 DSH 执行
  for (const text of scopes) {
    if (/hand\s+(?:it|this)\s+to\s+your\s+(?:AI|agent)|send\s+(?:it|this)\s+(?:line|prompt)\s+to\s+your|\bINSTALL\.md\b/i.test(text)) {
      return { method: 'manual', source: 'readme' }
    }
  }
  // 1) 脚本安装：curl|bash / irm|iex（无安装章节的全文兜底要求 raw.githubusercontent 的 .sh/.ps1）
  for (const text of scopes) {
    const strict = sections.length === 0
    const strictOk = (url) => strict ? /^https:\/\/raw\.githubusercontent\.com\/[^\s|'"]+\.(sh|ps1)\b/i.test(url) : /^https?:/i.test(url)
    const os = {}
    let m = /irm\s+(\S+?)\s*\|\s*iex\b/i.exec(text)
    if (m && strictOk(m[1])) os.win32 = 'irm ' + m[1] + ' | iex'
    m = /(curl\s+(?:-\S+\s+)*(\S+?)\s*\|\s*(?:sudo\s+)?(?:ba)?sh\b)/i.exec(text)
    if (m) {
      const cmd = m[1].trim()
      if (strictOk(m[2])) { os.darwin = cmd; os.linux = cmd }
    } else {
      m = /(wget\s+(?:-\S+\s+)*(\S+?)\s*(?:-O\s*-\s*)?\|\s*(?:sudo\s+)?(?:ba)?sh\b)/i.exec(text)
      if (m) {
        const cmd = m[1].trim()
        if (strictOk(m[2])) { os.darwin = cmd; os.linux = cmd }
      }
    }
    if (os.win32 || os.darwin || os.linux) {
      const urlCmd = os.darwin || os.linux || os.win32
      const um = /\s(\S+?)\s*\|/.exec(urlCmd)
      return { method: 'script', source: 'readme', scriptUrl: um ? um[1] : null, os }
    }
  }
  // 2) dsh plugin add（按章节顺序；spec 必须可远程安装）
  const addRe = /dsh\s+plugin(?:\s+--profile\s+\S+)?\s+(?:add|i)\s+(\S+)/i
  for (const text of scopes) {
    const m = addRe.exec(text)
    if (m && validAddArg(m[1].replace(/[;'"`]+$/, ''))) return { method: 'dsh-plugin-add', source: 'readme' }
  }
  // 3) npm install -g
  for (const text of scopes) {
    const m = /npm\s+(?:install|i)\s+(?:-g|--global)\s+(\S+)/i.exec(text)
    if (m) return { method: 'npm-global', source: 'readme', command: 'npm install -g ' + m[1].replace(/[;'"`]+$/, '') }
  }
  // 4) git clone
  for (const text of scopes) {
    const m = /git\s+clone\s+(?:--depth\s+\S+\s+)?(\S+)/i.exec(text)
    if (m) return { method: 'git-clone', source: 'readme', command: 'git clone ' + m[1].replace(/[;'"`]+$/, '') }
  }
  return null
}

// ── 单仓库 → 条目 ──────────────────────────────────────────────────────────
// verified 采用官方判据：package.json 里声明了 dsh.bundle.patch（与 dsh plugin
// add 的挂载判定 exportsPatch 一致）。topic 来源的仓库即使无声明也收录，
// 标 verified: false（未验证，禁用一键安装）。
// 上一轮已有数据的仓库直接复用版本/下载量/spec，跳过 releases 调用（省配额）。
export async function buildEntry(repo, prevAuto) {
  if (!repo.discoveredAs) repo.discoveredAs = repo.full_name
  const prevList = Array.isArray(prevAuto) ? prevAuto : (prevAuto ? [prevAuto] : [])

  // Canonicalize via GET /repos when we lack github id or stars. Write live full_name
  // so dsh-cc-tui / dsh-TUI / dsh-tui become one candidate (same numeric id).
  if (repo.githubId == null || typeof repo.stars !== 'number') {
    try {
      const detail = await ghJson('/repos/' + repo.full_name)
      if (detail) applyGithubRepoDetail(repo, detail)
    } catch (e) {
      console.warn('[collect] repo 详情获取失败（继续）: ' + repo.full_name)
    }
  }

  const [, name] = repo.full_name.split('/')
  let pkg = null
  try {
    const raw = await fetch('https://raw.githubusercontent.com/' + repo.full_name + '/HEAD/package.json', { headers: { 'user-agent': 'dsh-plugin-market-collector' } })
    if (raw.ok) pkg = await raw.json()
  } catch {}
  const hasDshSignal = !!(pkg && pkg.dsh && (pkg.dsh.bundle || pkg.dsh.client))
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {}
  const hasDshDep = Object.keys(deps).some((k) => k.startsWith('@deepseek-ai/dsh'))
  // org 成员身份即相关性信号：官方组织仓库即使 package.json 未声明 dsh 字段也保留
  if (!repo.topicSourced && !repo.orgSourced && !hasDshSignal && !hasDshDep) return null
  const verified = !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch)

  // 安装方式判定：优先取项目 README 写明的官方安装方式，其次按包特征启发式。
  // 关键原则：verified（声明了 dsh.bundle）不再默认 dsh-plugin-add——不是所有
  // bundle 都能直接 dsh plugin add（如要求自行构建 tarball 后本地安装的）。
  // README 拉取失败时沿用上一轮结论，避免网络抖动误伤已有数据。
  let readme = null
  for (const f of ['README.md', 'readme.md']) {
    try {
      const rr = await fetch('https://raw.githubusercontent.com/' + repo.full_name + '/HEAD/' + f, {
        headers: { 'user-agent': 'dsh-plugin-market-collector' },
        signal: AbortSignal.timeout(8000),
      })
      if (rr.ok) { readme = await rr.text(); break }
    } catch { break }
  }
  let install = detectInstallFromReadme(readme)
  if (!install && readme === null && prev && prev.install) {
    // README 全部拉取失败：沿用旧结论；但未经 README 核实的历史启发式
    // dsh-plugin-add（source: 'pkg'）一律降级为 manual，宁可保守不可装坏
    if (prev.install.method === 'dsh-plugin-add' && prev.install.source !== 'readme') {
      install = { method: 'manual', source: 'readme' }
    } else {
      install = prev.install
    }
  }
  if (!install) {
    if (pkg && pkg.bin) {
      install = { method: 'npm-global', command: 'npm install -g ' + (pkg.name || ''), source: 'pkg' }
    } else if (pkg && (pkg.dependencies && pkg.dependencies.electron || pkg.devDependencies && pkg.devDependencies.electron)) {
      install = { method: 'desktop', source: 'pkg' }
    } else {
      // README 未写明可自动识别的安装方式（本地构建/手动步骤等）→ 按仓库说明安装
      install = { method: 'manual', source: 'readme' }
    }
  }

  const prev = pickBestPrev(repo, pkg && pkg.name, prevList)
  // Do not reuse a stale prev.version across rename aliases (dsh-cc-tui vs dsh-TUI).
  // After canonicalize they are the same repo: fetch latest, or at least keep the higher tag.
  const alias = isAliasDiscovery(repo)
  const reuse = prev && prev.status !== 'unavailable' && !alias && prev.repo && prev.repo.toLowerCase() === repo.full_name.toLowerCase()

  let latest = null
  let downloads = 0
  if (reuse && typeof prev.version === 'string') {
    latest = { tag_name: prev.version, published_at: prev.releasedAt || null }
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
    latest = keepHigherVersion(latest, prev && prev.version, prev && prev.releasedAt)
    if (typeof downloads !== 'number' || downloads === 0) {
      if (prev && typeof prev.downloads === 'number') downloads = prev.downloads
    }
  } else if (prev && typeof prev.version === 'string') {
    latest = { tag_name: prev.version, published_at: prev.releasedAt || null }
    downloads = typeof prev.downloads === 'number' ? prev.downloads : 0
  }

  let stars = repo.stars
  let description = repo.description
  let license = repo.license
  let topics = repo.topics || []
  if (prev && prev.status !== 'unavailable') {
    description = description || prev.description
    license = license || prev.license
    topics = topics.length > 0 ? topics : (Array.isArray(prev.tags) ? prev.tags : [])
  }

  const spec = latest ? 'github:' + repo.full_name + '#' + latest.tag_name : 'github:' + repo.full_name
  const owner = repo.full_name.split('/')[0]
  const releasedAt = (latest && latest.published_at) || repo.pushedAt || (prev && prev.releasedAt) || null
  const entry = {
    id: pkg && pkg.name ? pkg.name.replace(/^@/, '').replace(/[/.]/g, '-') : name.toLowerCase(),
    name: (pkg && pkg.name) || name,
    type: 'bundle',
    package: (pkg && pkg.name) || null,
    repo: repo.full_name,
    githubId: repo.githubId != null ? repo.githubId : undefined,
    spec: spec,
    version: latest ? latest.tag_name : null,
    author: { name: owner, url: 'https://github.com/' + owner },
    description: (pkg && pkg.description) || description || '',
    tags: cleanTags(topics),
    license: license || 'UNKNOWN',
    downloads: downloads,
    stars: stars || 0,
    releasedAt: releasedAt,
    topicSourced: repo.topicSourced === true,
    verified: verified,
    install: install,
    source: 'auto',
    auto: true,
  }
  entry.category = categorize(entry)
  return entry
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const curatedItems = loadCuratedItems()
  const blocklist = (loadJson('registry/blocklist.json', []) || []).map((s) => String(s).toLowerCase())
  const prevAuto = (loadJson('registry/auto.json', { items: [] }).items) || []

  const candidates = await collectCandidates()
  const entries = []
  const seen = new Set()
  const markSeen = (it, extra) => {
    for (const k of allKeysOf(it)) seen.add(k)
    if (extra) {
      for (const a of extra.aliases || []) seen.add('repo:' + normRepo(a))
      if (extra.discoveredAs) seen.add('repo:' + normRepo(extra.discoveredAs))
      if (extra.full_name) seen.add('repo:' + normRepo(extra.full_name))
      if (extra.githubId != null) seen.add('ghid:' + extra.githubId)
    }
  }
  for (const repo of candidates) {
    if (blocklist.includes(normRepo(repo.full_name))) continue
    if ((repo.aliases || []).some((a) => blocklist.includes(normRepo(a)))) continue
    let entry = null
    try {
      entry = await buildEntry(repo, prevAuto)
    } catch (e) {
      console.warn('[collect] 处理失败 ' + repo.full_name + ': ' + e.message)
    }
    if (!entry) continue
    if (entry.package && blocklist.includes(normPkg(entry.package))) continue
    const key = keyOf(entry)
    if (seen.has(key) || allKeysOf(entry).some((k) => seen.has(k))) {
      const idx = entries.findIndex((e) => keyOf(e) === key || (entry.githubId != null && e.githubId === entry.githubId))
      if (idx >= 0 && compareVersion(entry.version, entries[idx].version) > 0) entries[idx] = entry
      markSeen(entry, repo)
      continue
    }
    markSeen(entry, repo)
    entries.push(entry)
    await sleep(400)
  }

  // 上轮存在、本轮未重新发现的条目：查一次 repo 状态，404/私有 → unavailable，限流/异常 → 保留原数据
  for (const prev of prevAuto) {
    if (allKeysOf(prev).some((k) => seen.has(k))) continue
    // topic 来源的老条目直接保留，不做逐条状态检查（降低每日 API 压力）
    if (prev.topicSourced === true) {
      entries.push(prev)
      markSeen(prev)
      continue
    }
    let detail = null
    try {
      detail = await ghJson('/repos/' + prev.repo)
    } catch (e) {
      console.warn('[collect] 状态检查限流，保留原条目: ' + prev.repo)
    }
    if (detail === undefined) {
      entries.push(prev)
      markSeen(prev)
    } else if (detail === null) {
      const gone = { ...prev, status: 'unavailable' }
      entries.push(gone)
      markSeen(gone)
      console.warn('[collect] 标记 unavailable: ' + prev.repo)
    } else {
      const canon = { full_name: prev.repo, githubId: prev.githubId, discoveredAs: prev.repo }
      applyGithubRepoDetail(canon, detail)
      const updated = { ...prev, repo: canon.full_name }
      if (canon.githubId != null) updated.githubId = canon.githubId
      if (allKeysOf(updated).some((k) => seen.has(k))) {
        markSeen(updated)
        continue
      }
      entries.push(updated)
      markSeen(updated)
    }
    await sleep(400)
  }

  // rename-collapse: same package + same owner (e.g. repo rename) → one auto row
  const collapsedEntries = collapsePackageOwnerDuplicates(entries, { log: (m) => console.log(m) })

  // curated 覆盖 auto（按包名/repo 键），all = curated ∪ auto-only
  const curatedKeys = new Set(curatedItems.flatMap((it) => allKeysOf(it)))
  const autoOnly = collapsedEntries.filter((e) => !allKeysOf(e).some((k) => curatedKeys.has(k)))
  const all = collapsePackageOwnerDuplicates(
    [...curatedItems, ...autoOnly],
    { preferCurated: true, log: (m) => console.log(m) },
  )
  for (const it of all) {
    it.category = categorize(it)
    if (Array.isArray(it.tags)) it.tags = cleanTags(it.tags)
    if (!('verified' in it)) it.verified = true
    if (!('source' in it)) it.source = 'curated'
    if (!it.install) {
      if (it.type === 'pack') it.install = { method: 'pack' }
      else if (it.verified === false) it.install = { method: 'manual' }
      else it.install = { method: 'dsh-plugin-add' }
    }
  }
  all.sort((a, b) => (b.stars || 0) - (a.stars || 0))

  writeFileSync(join(ROOT, 'registry/auto.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: collapsedEntries }, null, 2))
  writeFileSync(join(ROOT, 'registry/all.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: all }, null, 2))
  const byCat = {}
  for (const it of all) byCat[it.category] = (byCat[it.category] || 0) + 1
  console.log('[collect] curated=' + curatedItems.length + ' auto=' + collapsedEntries.length + ' merged=' + all.length)
  console.log('[collect] 分类分布: ' + JSON.stringify(byCat))
}

// 作为模块被 import 时（如 scripts/refresh-install.mjs）不自动执行主流程
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('[collect] 运行失败: ' + (e && e.message ? e.message : e))
    process.exit(1)
  })
}
