#!/usr/bin/env node
// 仅刷新 auto 条目的 install 字段：并发拉取各仓库 README（raw.githubusercontent，无 API 限流），
// 用 collect.mjs 的识别器提取官方安装方式后写回 auto.json / all.json。
// 与每日全量 collect 互补：全量 collect 负责发现新仓库，本脚本用于快速校准安装方式。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectInstallFromReadme } from './collect.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONCURRENCY = 12

const normPkg = (name) => String(name).toLowerCase()
const normRepo = (fullName) => 'github.com/' + String(fullName).toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
const keyOf = (it) => (it.package ? 'pkg:' + normPkg(it.package) : 'repo:' + normRepo(it.repo))

const loadJson = (rel, fallback) => {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return fallback
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}

async function fetchReadme(repo) {
  for (const f of ['README.md', 'readme.md']) {
    try {
      const res = await fetch('https://raw.githubusercontent.com/' + repo + '/HEAD/' + f, {
        headers: { 'user-agent': 'dsh-plugin-market-collector' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return await res.text()
    } catch { return null }
  }
  return null
}

async function main() {
  const curated = (loadJson('registry/index.json', { items: [] }).items) || []
  const auto = (loadJson('registry/auto.json', { items: [] }).items) || []
  if (auto.length === 0) {
    console.error('[refresh-install] auto.json 为空，先跑一次完整 collect')
    process.exit(1)
  }
  let done = 0
  let changed = 0
  const queue = [...auto]
  const worker = async () => {
    while (queue.length > 0) {
      const it = queue.shift()
      if (!it || !it.repo) continue
      const readme = await fetchReadme(it.repo)
      const next = detectInstallFromReadme(readme)
      if (next) {
        if (!it.install || it.install.method !== next.method) changed++
        // 保留原有 command/spec 信息，识别结果按字段合并
        it.install = { ...(it.install || {}), ...next }
      } else if (readme === null) {
        // README 拉取失败：未经 README 核实的历史启发式 dsh-plugin-add 降级为 manual
        if (it.install && it.install.method === 'dsh-plugin-add' && it.install.source !== 'readme') {
          changed++
          it.install = { method: 'manual', source: 'readme' }
        }
      } else if (it.type === 'pack' || (it.install && it.install.method === 'pack')) {
        // pack 条目不受影响
      } else if (it.install && (it.install.method === 'npm-global' || it.install.method === 'desktop')) {
        // 包特征启发式（bin/electron）保留
      } else if (!it.install || it.install.method !== 'manual') {
        // README 未写明可自动识别的安装方式 → 不再默认 dsh-plugin-add，改按仓库说明手动安装
        changed++
        it.install = { method: 'manual', source: 'readme' }
      } else if (!it.install.source) {
        it.install.source = 'readme'
      }
      done++
      if (done % 200 === 0) console.log('[refresh-install] ' + done + '/' + auto.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const curatedKeys = new Set(curated.map(keyOf))
  const autoOnly = auto.filter((e) => !curatedKeys.has(keyOf(e)))
  const all = [...curated, ...autoOnly]
  all.sort((a, b) => (b.stars || 0) - (a.stars || 0))

  writeFileSync(join(ROOT, 'registry/auto.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: auto }, null, 2))
  writeFileSync(join(ROOT, 'registry/all.json'), JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: all }, null, 2))
  const dist = {}
  for (const it of all) {
    const m = (it.install && it.install.method) || 'none'
    dist[m] = (dist[m] || 0) + 1
  }
  console.log('[refresh-install] 完成: auto=' + auto.length + ' merged=' + all.length + ' 识别变化=' + changed)
  console.log('[refresh-install] 安装方式分布: ' + JSON.stringify(dist))
}

main().catch((e) => {
  console.error('[refresh-install] 失败: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
