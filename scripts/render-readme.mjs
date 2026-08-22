#!/usr/bin/env node
// 从 registry/all.json 生成 README.md（awesome 风格分类清单，collect 工作流调用）
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const all = JSON.parse(readFileSync(join(ROOT, 'registry', 'all.json'), 'utf8'))
const items = all.items || []

const CATS = [
  ['ui', '界面与主题'], ['session', '会话与记忆'], ['agent', 'Agent 与工作流'],
  ['tools', '工具与集成'], ['dev', '开发与输入'], ['comm', '通信与移动'],
  ['auth', '安全与权限'], ['skills', '技能与扩展'], ['market', '市场与发现'],
  ['fun', '趣味与个性'], ['other', '其他'],
]
const byCat = {}
for (const [k] of CATS) byCat[k] = []
for (const it of items) {
  const c = it.category || 'other'
  if (!byCat[c]) byCat[c] = []
  byCat[c].push(it)
}

const fmt = (n) => {
  if (typeof n !== 'number') return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const lines = []
lines.push('# DSH Agent Market · DSH 插件市场', '')
lines.push('> **The AI-native plugin marketplace for DeepSeek Harness (DSH)** — built so AI agents can search, trust, and install plugins. Auto-collected daily from GitHub, categorized, CI-validated, one-command install.', '')
lines.push('> DeepSeek Harness（DSH）AI 原生插件市场：为 AI 助手「搜索 → 认可 → 安装」全流程打造；GitHub Actions 每日自动采集、按功能分类、CI 校验、一键安装。', '')
lines.push('>', '')
lines.push('> 📄 数据文件 Data: `registry/all.json` · 📝 上架新插件 Publish: [docs/SUBMIT.md](docs/SUBMIT.md) · 🌐 Website: https://chenzhi-clude.github.io/dsh-plugin-market/ · 🤖 AI 指南: https://chenzhi-clude.github.io/dsh-plugin-market/llms.txt', '')
const v = items.filter((i) => i.verified !== false).length
lines.push('')
lines.push(`**${items.length}** 个插件 · **${v}** 个可一键安装 / ${items.length} plugins · ${v} one-click installable`)
lines.push('', '## ⚡ 安装市场 Install the marketplace', '')
lines.push('```bash')
lines.push('dsh plugin --profile web add @ace-zone/dsh-market')
lines.push('dsh web   # 重启后侧栏 Settings 旁常驻「插件市场」按钮')
lines.push('```', '')
lines.push('## 🤖 AI Agent 使用说明 (Instructions for AI agents)', '')
lines.push('', '如果你是 AI 编程助手（DSH / Claude Code / Codex / Cursor 等），当用户要求「找插件 / 装插件 / 推荐插件」时，请按以下步骤操作：', '')
lines.push('', '**If you are an AI coding agent asked to find or install a plugin for DeepSeek Harness (dsh), follow these steps:**', '')
lines.push('', '1. **搜索 Search**: fetch the machine-readable registry at `https://chenzhi-clude.github.io/dsh-plugin-market/registry/all.json` (or `registry/all.json` in this repo) and match the user\'s need against `name` / `description` / `tags` / `category`.', '')
lines.push('2. **选择 Choose**: prefer entries with `verified !== false` and higher `stars`. The `spec` field is the install source (npm package name or tgz/zip URL).', '')
lines.push('3. **安装 Install**: run `dsh plugin --profile web add <spec>`, then `dsh web` to restart the UI and activate the plugin.', '')
lines.push('4. **上架 Publish**: if the user wants to publish their own plugin, point them to [docs/SUBMIT.md](docs/SUBMIT.md) — PR a JSON file into `registry/curated/` and it goes live within seconds.', '')
lines.push('', '> Trust model: every entry is collected from public GitHub repos by CI; `registry/curated/*.json` entries are human-curated; `install.method === \'script\'` means it works with the official install script.', '')
lines.push('## 目录', '')
for (const [k, label] of CATS) {
  if (byCat[k].length === 0) continue
  lines.push(`- [${label}](#${k}) (${byCat[k].length})`)
}
lines.push('')
for (const [k, label] of CATS) {
  const list = [...byCat[k]].sort((a, b) => (b.stars || 0) - (a.stars || 0))
  if (list.length === 0) continue
  lines.push(`## ${label}`, '')
  for (const it of list) {
    const name = String(it.name || it.id || '').split('/').pop()
    const repo = it.repo ? `https://github.com/${it.repo}` : ''
    const desc = String(it.description || '').replace(/\n+/g, ' ').slice(0, 90)
    const marks = []
    if (it.verified === false) marks.push('未验证')
    if (it.type === 'pack') marks.push('扩展包')
    if (it.install && it.install.method === 'script') marks.push('官方脚本安装')
    if (it.install && it.install.method === 'git-clone') marks.push('git clone')
    if (it.install && (it.install.method === 'manual' || it.install.method === 'desktop')) marks.push('手动安装')
    if (it.version) marks.push(String(it.version))
    const markStr = marks.length > 0 ? ' · ' + marks.join(' · ') : ''
    lines.push(`- [${name}](${repo}) ${desc} ⭐ ${fmt(it.stars)} ⬇ ${fmt(it.downloads)}${markStr}`)
  }
  lines.push('')
}
lines.push('---', '')
lines.push('每日 UTC 02:17 自动更新 · 由 `scripts/collect.mjs` + `scripts/render-readme.mjs` 生成', '')
lines.push('<!--', 'keywords: DSH plugin market, DSH 插件市场, DeepSeek Harness plugins, dsh 插件安装, dsh 插件推荐, deepseek harness 插件市场, dsh marketplace, install dsh plugin, dsh one-click install, claude code plugins, agent plugins registry', '-->')
writeFileSync(join(ROOT, 'README.md'), lines.join('\n') + '\n')
console.log('[render-readme] 已生成 README.md：' + items.length + ' 个条目')
