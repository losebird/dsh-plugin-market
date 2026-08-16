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
lines.push('# DSH 插件市场', '')
lines.push('> 由 GitHub Actions 每日自动采集、按功能分类的 DSH 社区插件清单。', '')
lines.push('> 数据文件：`registry/all.json`（上架新插件见 `docs/SUBMIT.md`）。', '')
const v = items.filter((i) => i.verified !== false).length
lines.push(`**${items.length}** 个插件 · **${v}** 个可一键安装`)
lines.push('', '安装市场：', '')
lines.push('```bash')
lines.push('dsh plugin --profile web add github:losebird/dsh-plugin-market#v0.1.25')
lines.push('dsh web   # 重启后侧栏 Settings 旁常驻「插件市场」按钮')
lines.push('```', '')
lines.push('网站：https://www.dsh-plugin.shop · 仓库：https://github.com/losebird/dsh-plugin-market', '')
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
    if (it.install && (it.install.method === 'manual' || it.install.method === 'desktop')) marks.push('手动安装')
    if (it.version) marks.push(String(it.version))
    const markStr = marks.length > 0 ? ' · ' + marks.join(' · ') : ''
    lines.push(`- [${name}](${repo}) ${desc} ⭐ ${fmt(it.stars)} ⬇ ${fmt(it.downloads)}${markStr}`)
  }
  lines.push('')
}
lines.push('---', '')
lines.push('每日 UTC 02:17 自动更新 · 由 `scripts/collect.mjs` + `scripts/render-readme.mjs` 生成')
writeFileSync(join(ROOT, 'README.md'), lines.join('\n') + '\n')
console.log('[render-readme] 已生成 README.md：' + items.length + ' 个条目')
