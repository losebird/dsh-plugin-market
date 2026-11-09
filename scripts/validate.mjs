#!/usr/bin/env node
// curated 条目校验：PR 合入前的 schema 检查（validate workflow 调用）
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allKeysOf } from './canonicalize-repo.mjs'

// argv[2] lets a test point the same checks at a temp registry tree.
const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..')
const CURATED_DIR = join(ROOT, 'registry', 'curated')
const errors = []

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { errors.push(rel + ' 不是合法 JSON: ' + e.message); return fallback }
}

const blocklist = (loadJson('registry/blocklist.json', []) || []).map((s) => String(s).toLowerCase())
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const ALLOWED_CATEGORIES = new Set(['ui', 'session', 'agent', 'tools', 'dev', 'comm', 'auth', 'skills', 'market', 'fun', 'other'])

function checkEntry(entry, file) {
  const where = file + ': '
  for (const field of ['id', 'name', 'type', 'repo', 'spec', 'description', 'license']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) errors.push(where + '缺少/非法字段 ' + field)
  }
  if (typeof entry.id === 'string' && !ID_RE.test(entry.id)) errors.push(where + 'id 不符合 ' + ID_RE)
  if (entry.type !== 'bundle' && entry.type !== 'pack') errors.push(where + 'type 必须是 bundle 或 pack')
  if (entry.category !== undefined && !ALLOWED_CATEGORIES.has(entry.category)) {
    errors.push(where + 'category 必须是: ' + [...ALLOWED_CATEGORIES].join(' | '))
  }
  if (!entry.author || typeof entry.author.name !== 'string') errors.push(where + '缺少 author.name')
  if (entry.author && entry.author.url && !/^https:\/\//.test(entry.author.url)) errors.push(where + 'author.url 必须以 https:// 开头')
  if (entry.type === 'bundle') {
    const spec = String(entry.spec || '')
    const ok = /^(github:|git\+)[^\s"']+(#[^\s"']+)?$/.test(spec)
      || /^https:\/\/[^\s"']+\.(?:tgz|tar\.gz)(?:[?#][^\s"']*)?$/i.test(spec)
      || /^@?[\w.-]+\/[\w.-]+$/.test(spec)
      || /^[\w@.-]+$/.test(spec)
    if (!ok) errors.push(where + 'bundle spec 必须是 npm 包名或 https://…tgz')
  } else {
    if (!/^https:\/\/[^\s"']+\.zip(?:[?#][^\s"']*)?$/i.test(String(entry.spec || ''))) {
      errors.push(where + 'pack spec 必须是 https://…zip')
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(entry.repo)) errors.push(where + 'repo 必须是 owner/name 形式')
}

const files = existsSync(CURATED_DIR) ? readdirSync(CURATED_DIR).filter((f) => f.endsWith('.json')) : []
const seen = new Set()
// Dedupe keys must match the merge (`keyOf`/`allKeysOf` in canonicalize-repo,
// used by collect.loadCuratedItems and merge-curated). Two curated files that
// point at the same repo or npm package collapse into ONE entry there, which
// is silently order-dependent on the file name — a merged PR would look green
// and then never appear in the catalog. Reject the PR instead of dropping it.
const seenIdentity = new Map()
for (const file of files) {
  const entry = loadJson(join('registry', 'curated', file), null)
  if (!entry) { errors.push(file + ' 无法解析'); continue }
  checkEntry(entry, file)
  if (entry.id && seen.has(entry.id)) errors.push(file + ': id 重复 ' + entry.id)
  seen.add(entry.id)
  const identityKeys = allKeysOf(entry).filter((k) => !k.startsWith('id:'))
  for (const key of identityKeys) {
    const owner = seenIdentity.get(key)
    if (owner) errors.push(file + ': 与 ' + owner + ' 指向同一个插件（' + key + '），merge 只会保留一条')
  }
  for (const key of identityKeys) seenIdentity.set(key, file)
  const lowered = (entry.repo || '').toLowerCase()
  if (blocklist.includes(lowered)) errors.push(file + ': repo 在黑名单中 ' + entry.repo)
}

if (errors.length > 0) {
  console.error('校验失败:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('校验通过: ' + files.length + ' 个 curated 条目')
