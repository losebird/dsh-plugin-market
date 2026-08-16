#!/usr/bin/env node
// 补漏脚本：把官方组织（omdsh-dev 等）里尚未收录的仓库补进 auto.json / all.json。
// 复用 collect.mjs 的 buildEntry（含 README 安装方式识别），只处理缺失仓库，
// 不做全量候选发现，因此无 API 限流压力、分钟级完成。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntry } from './collect.mjs'

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

async function orgRepos(org) {
  const res = await fetch('https://api.github.com/orgs/' + org + '/repos?per_page=100', {
    headers: { 'user-agent': 'dsh-plugin-market-collector' },
  })
  if (!res.ok) throw new Error('org 仓库列表失败: ' + res.status)
  return res.json()
}

async function main() {
  const auto = (loadJson('registry/auto.json', { items: [] }).items) || []
  const curated = (loadJson('registry/index.json', { items: [] }).items) || []
  const have = new Set(auto.map((i) => (i.repo ? i.repo.toLowerCase() : '')))
  const added = []
  for (const org of ORGS) {
    const repos = await orgRepos(org)
    for (const r of repos) {
      if (have.has(r.full_name.toLowerCase())) continue
      try {
        const entry = await buildEntry({
          full_name: r.full_name,
          orgSourced: true,
          stars: r.stargazers_count || 0,
          description: r.description || '',
          license: r.license && r.license.spdx_id ? r.license.spdx_id : null,
          topics: r.topics || [],
          pushedAt: r.pushed_at || null,
        }, undefined)
        if (entry) {
          auto.push(entry)
          added.push(entry.repo)
          console.log('[fill-gaps] 新增: ' + entry.repo + ' (' + ((entry.install && entry.install.method) || '?') + ')')
        }
      } catch (e) {
        console.warn('[fill-gaps] 处理失败 ' + r.full_name + ': ' + e.message)
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
