// dsh-plugin-market host 半片：REST API + 安装/卸载执行
// /plugin-market/list      GET   → { source, notice, items, installed }
// /plugin-market/install   POST  → { ok, message | error }
// /plugin-market/uninstall POST  → { ok, message | error }
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { marked } from 'marked'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REGISTRY_URL = process.env.DSH_MARKET_REGISTRY || 'https://raw.githubusercontent.com/losebird/dsh-plugin-market/main/registry/all.json'
const STATE_DIR = join(homedir(), '.dsh', 'plugin-market')
const STATE_FILE = join(STATE_DIR, 'state.json')
const SKILLS_ROOT = join(homedir(), '.agents', 'skills')
const PRESETS_ROOT = join(homedir(), '.dsh', '.agent-presets')
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE_MANIFEST = join(DSH_HOME, 'profiles', 'web', 'package.json')

async function readProfileManifest() {
  try {
    return JSON.parse(await readFile(PROFILE_MANIFEST, 'utf8'))
  } catch {
    return null
  }
}

async function writeProfileManifest(m) {
  await writeFile(PROFILE_MANIFEST, JSON.stringify(m, null, 2) + '\n')
}

function profileInstalled(manifest) {
  const deps = new Set(Object.keys((manifest && manifest.dependencies) || {}))
  const bundles = new Set((manifest && manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [])
  return { deps, bundles }
}

// 扫描其他 profile（排除 web），返回 包名 → [profile 名] 映射
async function otherProfileMap() {
  const map = new Map()
  let dirs = []
  try { dirs = await readdir(join(DSH_HOME, 'profiles')) } catch { return map }
  for (const d of dirs) {
    if (d === 'web' || d.startsWith('-')) continue
    try {
      const m = JSON.parse(await readFile(join(DSH_HOME, 'profiles', d, 'package.json'), 'utf8'))
      const names = new Set(Object.keys(m.dependencies || {}))
      for (const b of (m.dsh && m.dsh.profile && m.dsh.profile.bundles) || []) names.add(b)
      for (const n of names) {
        if (!map.has(n)) map.set(n, [])
        map.get(n).push(d)
      }
    } catch {}
  }
  return map
}

const DEMO_ITEMS = [
  {
    id: 'dsh-plugin-market',
    name: 'DSH 插件市场',
    type: 'bundle',
    package: 'dsh-plugin-market',
    spec: 'github:losebird/dsh-plugin-market#v0.1.16',
    version: 'v0.1.3',
    author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: 'DSH 的社区插件市场本体：按钮 + 卡片弹窗 + 一键安装。',
    tags: ['market', 'ui'],
    license: 'MIT',
    downloads: 0,
    stars: 0,
    demo: true,
  },
  {
    id: 'demo-hello',
    name: 'Demo Hello Skill（演示扩展包）',
    type: 'pack',
    spec: 'https://www.dsh-plugin.shop/registry/examples/demo-hello/demo-hello.zip',
    version: 'v0.1.0',
    author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: '演示用 skill 扩展包：安装后新增一个 demo-hello 技能，验证市场安装链路。',
    tags: ['demo', 'skill'],
    license: 'MIT',
    downloads: 0,
    stars: 0,
    demo: true,
  },
]

const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeState(next) {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(STATE_FILE, JSON.stringify(next, null, 2))
}

function validBundleSpec(s) {
  if (typeof s !== 'string') return false
  return /^(github:|git\+|https?:\/\/|file:\/\/)[^\s'"]+$/.test(s) || /^@?[\w.-]+\/[\w.-]+$/.test(s) || /^[\w@.-]+$/.test(s)
}

async function list() {
  const state = await readState()
  const installed = state.installed && typeof state.installed === 'object' ? state.installed : {}
  let items = null
  let source = 'demo'
  let notice = null
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const parsed = await res.json()
      if (parsed && Array.isArray(parsed.items)) {
        items = parsed.items
        source = 'remote'
      } else {
        notice = 'registry 数据格式异常，已回退演示数据'
      }
    }
  } catch {
    notice = '远程 registry 暂不可用，已回退演示数据'
  }
  const finalItems = items || DEMO_ITEMS
  // 手动安装（dsh plugin add）识别：profile 依赖/bundles 里有这个包名 → 标记已安装
  const manifest = await readProfileManifest()
  const { deps, bundles } = profileInstalled(manifest)
  const otherMap = await otherProfileMap()
  for (const it of finalItems) {
    if (!it.package) continue
    if ((deps.has(it.package) || bundles.has(it.package)) && !(it.id in installed)) {
      installed[it.id] = { type: 'bundle', spec: it.spec || '', package: it.package, source: 'manual' }
    } else if (!(it.id in installed) && otherMap.has(it.package)) {
      // 装在其他 profile：标记来源，市场安装时自动迁移
      installed[it.id] = { type: 'bundle', spec: it.spec || '', package: it.package, source: 'other', profile: otherMap.get(it.package)[0] }
    }
  }
  return { source, notice, items: finalItems, installed }
}

async function install(args) {
  if (!args || typeof args !== 'object' || typeof args.id !== 'string' || typeof args.type !== 'string') {
    return { ok: false, error: '参数错误' }
  }
  // 安装方式分发：按插件自身声明的方法执行
  const method = args.install && args.install.method ? args.install.method : (args.type === 'pack' ? 'pack' : 'dsh-plugin-add')
  if (method === 'npm-global' || method === 'command') {
    const cmd = (args.install && args.install.command) || (method === 'npm-global' ? 'npm install -g ' + (args.package || args.id) : '')
    if (!cmd) return { ok: false, error: '缺少安装命令' }
    const r = await runShell(cmd, 600000, { fullAccess: true })
    if (!r.ok) return { ok: false, error: (r.stderr || '').trim() || '安装失败' }
    const state = await readState()
    const installed = state.installed || {}
    installed[args.id] = { type: 'bundle', spec: args.spec || cmd, package: args.package || null, at: new Date().toISOString(), installCmd: cmd }
    await writeState({ installed })
    return { ok: true, message: '安装完成: ' + cmd }
  }
  if (method === 'desktop' || method === 'manual') {
    return { ok: false, error: '该插件需按其仓库说明安装，请打开详情查看 README' }
  }
  if (typeof args.spec !== 'string') return { ok: false, error: '参数错误' }
  if (args.type === 'bundle') {
    if (!validBundleSpec(args.spec)) return { ok: false, error: '非法的安装源 spec' }
    const r = await runShell('dsh plugin --profile web add ' + q(args.spec), 300000, { fullAccess: true })
    if (!r.ok) return { ok: false, error: (r.stderr || '').trim() || 'dsh plugin add 失败' }
    // 自动迁移：若同名包存在于其他 profile，从中移除，避免“装了却不生效”
    const migratedFrom = []
    const pkgName = typeof args.package === 'string' && args.package ? args.package : null
    if (pkgName) {
      const otherMap = await otherProfileMap()
      for (const prof of (otherMap.get(pkgName) || [])) {
        try {
          const p = join(DSH_HOME, 'profiles', prof, 'package.json')
          const m = JSON.parse(await readFile(p, 'utf8'))
          if (m.dependencies && m.dependencies[pkgName]) delete m.dependencies[pkgName]
          const bl = (m.dsh && m.dsh.profile && m.dsh.profile.bundles) || []
          const idx = bl.indexOf(pkgName)
          if (idx !== -1) bl.splice(idx, 1)
          await writeFile(p, JSON.stringify(m, null, 2) + '\n')
          migratedFrom.push(prof)
        } catch {}
      }
    }
    const state = await readState()
    const installed = state.installed || {}
    installed[args.id] = {
      type: 'bundle',
      spec: args.spec,
      package: pkgName || args.id,
      at: new Date().toISOString(),
    }
    await writeState({ installed })
    const migrateNote = migratedFrom.length > 0 ? '（已自动从其他 profile 迁移: ' + migratedFrom.join(', ') + '）' : ''
    return { ok: true, message: '已安装到 web profile，重启 dsh 后生效' + migrateNote }
  }
  if (args.type === 'pack') {
    const url = args.spec
    if (!/^(https:\/\/|file:\/\/)[^\s'"]+$/.test(url)) return { ok: false, error: '非法的下载地址' }
    const tmp = join(STATE_DIR, '.tmp-' + process.pid + '-' + Date.now())
    const tmpQ = q(tmp)
    const dl = url.startsWith('https://')
      ? 'curl -fsSL --max-time 300 ' + q(url) + ' -o ' + tmpQ + '/pkg.zip'
      : 'cp ' + q(url.slice(7)) + ' ' + tmpQ + '/pkg.zip'
    const r1 = await runShell('rm -rf ' + tmpQ + ' && mkdir -p ' + tmpQ + ' && ' + dl, 330000, { fullAccess: true })
    if (!r1.ok) return { ok: false, error: '下载失败: ' + ((r1.stderr || '').trim() || '未知错误') }
    const r2 = await runShell('cd ' + tmpQ + ' && unzip -o -q pkg.zip && test -f manifest.json', 60000, { fullAccess: true })
    if (!r2.ok) return { ok: false, error: '压缩包校验失败（缺少 manifest.json 或解压出错）' }
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(tmp, 'manifest.json'), 'utf8'))
    } catch {
      return { ok: false, error: 'manifest.json 解析失败' }
    }
    const packs = Array.isArray(manifest.skills) ? manifest.skills.map(String) : []
    const presets = Array.isArray(manifest.presets) ? manifest.presets.map(String) : []
    if (packs.length === 0 && presets.length === 0) return { ok: false, error: 'manifest 未声明任何 skill 或 preset' }
    for (const id of [...packs, ...presets]) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) return { ok: false, error: '非法目录 id: ' + id }
    }
    const state = await readState()
    const installed = state.installed || {}
    const conflicts = []
    for (const id of packs) if (!(id in installed)) conflicts.push('skill ' + id)
    for (const id of presets) if (!(id in installed)) conflicts.push('preset ' + id)
    if (conflicts.length > 0) return { ok: false, error: '目标目录已存在且非本市场管理，拒绝覆盖: ' + conflicts.join(', ') }
    // 更新模式：先删除本市场管理的旧目录
    try {
      for (const id of packs) await rm(join(SKILLS_ROOT, id), { recursive: true, force: true })
      for (const id of presets) await rm(join(PRESETS_ROOT, id), { recursive: true, force: true })
      for (const id of packs) {
        await mkdir(SKILLS_ROOT, { recursive: true })
        await runShell('cp -R ' + q(join(tmp, 'skills', id)) + ' ' + q(SKILLS_ROOT) + '/', 60000, { fullAccess: true })
      }
      for (const id of presets) {
        await mkdir(PRESETS_ROOT, { recursive: true })
        await runShell('cp -R ' + q(join(tmp, 'presets', id)) + ' ' + q(PRESETS_ROOT) + '/', 60000, { fullAccess: true })
      }
    } catch (e) {
      return { ok: false, error: '写入失败: ' + String(e && e.message ? e.message : e) }
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
    for (const id of packs) installed[id] = { type: 'pack', kind: 'skill', spec: url, at: new Date().toISOString() }
    for (const id of presets) installed[id] = { type: 'pack', kind: 'preset', spec: url, at: new Date().toISOString() }
    await writeState({ installed })
    const what = []
    if (packs.length > 0) what.push('skill: ' + packs.join(', '))
    if (presets.length > 0) what.push('preset: ' + presets.join(', '))
    return { ok: true, message: '已安装 ' + what.join('；') + (presets.length > 0 ? '（preset 需在新会话预设列表中选择后生效）' : '') }
  }
  return { ok: false, error: '未知条目类型' }
}

async function uninstall(args) {
  if (!args || typeof args !== 'object' || typeof args.id !== 'string') return { ok: false, error: '参数错误' }
  const state = await readState()
  const installed = state.installed || {}
  const rec = installed[args.id]
  if (!rec) return { ok: false, error: '该条目不是本市场安装的' }
  if (rec.type === 'bundle') {
    const name = typeof rec.package === 'string' && rec.package ? rec.package : args.id
    const r = await runShell('dsh plugin --profile web remove ' + q(name), 300000, { fullAccess: true })
    if (!r.ok) return { ok: false, error: ((r.stderr || '').trim() || 'dsh plugin remove 失败') }
    delete installed[args.id]
    await writeState({ installed })
    return { ok: true, message: '已卸载 ' + name + '，重启 dsh 后生效' }
  }
  if (rec.type === 'pack') {
    const root = rec.kind === 'preset' ? PRESETS_ROOT : SKILLS_ROOT
    try {
      await rm(join(root, args.id), { recursive: true, force: true })
    } catch (e) {
      return { ok: false, error: '删除失败: ' + String(e && e.message ? e.message : e) }
    }
    delete installed[args.id]
    await writeState({ installed })
    return { ok: true, message: '已卸载 ' + args.id }
  }
  return { ok: false, error: '未知安装类型' }
}

// 宿主 shell 服务封装（resolve → run，容错）
// 注意：DSH shell 服务的 stdout/stderr 是 { text, truncated } 对象而非字符串；
// 安装/卸载类命令需要越出会话工作区写用户目录，显式携带 danger-full-access
// 沙箱策略（用户在弹窗点击安装即授权，等同于自己跑命令）。
async function runShell(command, timeoutMs, opts = {}) {
  const shell = runShell.shellService
  if (!shell) return { ok: false, stdout: '', stderr: 'shell 服务不可用' }
  let request = { command, timeoutMs: timeoutMs || 60000 }
  if (opts.fullAccess) {
    let workspaceRoot
    try {
      const sp = runShell.sandboxPolicyService
      const standing = sp ? sp.resolve({}) : null
      workspaceRoot = standing ? standing.workspaceRoot : undefined
    } catch {}
    request = {
      ...request,
      sandboxPolicy: { mode: 'danger-full-access', ...(workspaceRoot ? { workspaceRoot } : {}) },
    }
  }
  let spec
  try {
    spec = shell.resolve(request)
  } catch (e) {
    return { ok: false, stdout: '', stderr: 'shell.resolve 失败: ' + String(e) }
  }
  try {
    const result = await shell.run(spec)
    return {
      ok: result.exitCode === 0,
      stdout: (result.stdout && typeof result.stdout === 'object' && typeof result.stdout.text === 'string') ? result.stdout.text : String(result.stdout || ''),
      stderr: (result.stderr && typeof result.stderr === 'object' && typeof result.stderr.text === 'string') ? result.stderr.text : String(result.stderr || ''),
    }
  } catch (e) {
    return { ok: false, stdout: '', stderr: 'shell.run 失败: ' + String(e) }
  }
}

// ── 插件管理：已安装列表 / 禁用启用 / 删除 ──────────────────────────────────
async function installedRows() {
  const manifest = await readProfileManifest()
  const { bundles } = profileInstalled(manifest)
  const state = await readState()
  const marketInstalled = state.installed || {}
  const loader = installedRows.loader
  const entries = loader ? loader.entries() : []
  const rows = []
  for (const e of entries) {
    const name = e.options && e.options.name
    const rowId = e.options && e.options.id
    if (!name) continue
    if (name.startsWith('@deepseek-ai/dsh-')) continue
    const inBundles = bundles.has(name)
    const marketRec = Object.values(marketInstalled).find((r) => r && (r.package === name || r.spec === name))
    rows.push({
      id: rowId || name,
      name: name,
      enabled: inBundles,
      disabled: !!e.disabled,
      failed: !!(e.fiber && e.fiber.error),
      source: marketRec ? 'market' : 'manual',
      at: marketRec && marketRec.at ? marketRec.at : null,
    })
  }
  return rows
}

async function togglePlugin(args) {
  const name = args && args.name
  const enabled = !!(args && args.enabled)
  if (!name) return { ok: false, error: '参数错误' }
  const manifest = await readProfileManifest()
  if (!manifest) return { ok: false, error: '读取 profile 失败' }
  const bundles = [...((manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [])]
  const idx = bundles.indexOf(name)
  if (enabled && idx === -1) bundles.push(name)
  if (!enabled && idx !== -1) bundles.splice(idx, 1)
  manifest.dsh = { ...(manifest.dsh || {}), profile: { ...(manifest.dsh && manifest.dsh.profile), bundles } }
  await writeProfileManifest(manifest)
  return { ok: true, message: (enabled ? '已启用 ' : '已禁用 ') + name + '，重启 dsh 后生效' }
}

async function removePlugin(args) {
  const name = args && args.name
  if (!name) return { ok: false, error: '参数错误' }
  const r = await runShell('dsh plugin --profile web remove ' + q(name), 300000, { fullAccess: true })
  if (!r.ok) return { ok: false, error: (r.stderr || '').trim() || 'dsh plugin remove 失败' }
  const state = await readState()
  const installed = state.installed || {}
  for (const k of Object.keys(installed)) {
    const rec = installed[k]
    if (rec && (rec.package === name || rec.spec === name || k === name)) delete installed[k]
  }
  await writeState({ installed })
  return { ok: true, message: '已卸载 ' + name + '，重启 dsh 后生效' }
}

const readBody = (req) => new Promise((resolve, reject) => {
  let data = ''
  req.on('data', (chunk) => {
    data += chunk
    if (data.length > 1e6) {
      reject(new Error('body too large'))
      req.destroy()
    }
  })
  req.on('end', () => resolve(data))
  req.on('error', reject)
})

const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

export default {
  inject: ['webServer', 'shell', 'loader'],
  apply(ctx) {
    const webServer = ctx.webServer
    const shell = ctx.shell
    console.log('[dsh-plugin-market] host apply: webServer=' + (webServer !== undefined) + ' shell=' + (shell !== undefined))
    runShell.shellService = shell
    runShell.sandboxPolicyService = ctx.get('sandboxPolicy')
    installedRows.loader = ctx.loader

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/plugin-market',
    handler: async (req, res) => {
      const pathname = (req.url || '').split('?')[0]
      try {
        if (pathname === '/plugin-market/list' && req.method === 'GET') return json(res, 200, await list())
        if (pathname === '/plugin-market/install' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await install(body))
        }
        if (pathname === '/plugin-market/uninstall' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await uninstall(body))
        }
        if (pathname === '/plugin-market/installed' && req.method === 'GET') {
          return json(res, 200, { ok: true, rows: await installedRows() })
        }
        if (pathname === '/plugin-market/toggle' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await togglePlugin(body))
        }
        if (pathname === '/plugin-market/remove' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await removePlugin(body))
        }
        if (pathname === '/plugin-market/readme' && req.method === 'GET') {
          const url = new URL(req.url, 'http://x')
          const repo = url.searchParams.get('repo') || ''
          if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json(res, 400, { ok: false, error: 'bad repo' })
          try {
            const base = 'https://raw.githubusercontent.com/' + repo + '/HEAD/'
            const r = await fetch(base + 'README.md', { signal: AbortSignal.timeout(8000) })
            if (!r.ok) return json(res, 200, { ok: false, error: 'no readme' })
            let text = await r.text()
            text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
              if (/^https?:/i.test(src)) return m
              return '![' + alt + '](' + base + src.replace(/^\.\//, '') + ')'
            })
            const safe = String(marked.parse(text))
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
              .replace(/javascript:/gi, '')
            return json(res, 200, { ok: true, html: safe })
          } catch (e) {
            return json(res, 200, { ok: false, error: String(e && e.message ? e.message : e) })
          }
        }
        json(res, 404, { ok: false, error: 'not found' })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-plugin-market: /plugin-market routes')
  },
}
