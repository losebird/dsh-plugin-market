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

// 放行 pnpm 构建脚本（pnpm-workspace.yaml 顶层设置 —— pnpm 10.4+ 读取顶层键，
// 我们曾误写进 "pnpm:" 嵌套段导致整段被忽略；这里同时完成旧格式迁移与清理）。
// 机制：dangerouslyAllowAllBuilds: true 为全局开关，覆盖 git 依赖 prepare 与普通依赖
// install/postinstall 两阶段；allowBuilds 映射写入 pnpm 报错要求的精确 depPath 键
// （<包名>@<codeload-tarball-URL>）作为双保险。用户在弹窗点击安装即授权。
async function allowBuild(extraKeys = []) {
  const p = join(DSH_HOME, 'profiles', 'web', 'pnpm-workspace.yaml')
  let text = ''
  try { text = await readFile(p, 'utf8') } catch {}
  const lines = text.split('\n')
  const keys = new Set()
  for (const k of extraKeys) {
    if (typeof k === 'string' && k.includes('@') && k.length < 400 && !/\s/.test(k)) keys.add(k)
  }
  const skip = new Set()
  // 1) 顶层 allowBuilds 块：收集键并标记删除（重建时合并）
  for (let i = 0; i < lines.length; i++) {
    if (!/^allowBuilds\s*:/.test(lines[i])) continue
    skip.add(i)
    let j = i + 1
    while (j < lines.length && (/^\s{2}\S/.test(lines[j]) || lines[j].trim() === '')) {
      skip.add(j)
      const m = /^\s{2}["']?([^\s#]+?)["']?\s*:\s*true\s*$/.exec(lines[j])
      if (m && m[1].includes('@')) keys.add(m[1])
      j++
    }
  }
  // 2) 顶层 dangerouslyAllowAllBuilds 行：标记删除（重建）
  for (let i = 0; i < lines.length; i++) {
    if (/^dangerouslyAllowAllBuilds\s*:/.test(lines[i])) skip.add(i)
  }
  // 3) 旧版误写的 "pnpm:" 段：若只含我们写过的 allowBuilds/dangerouslyAllowAllBuilds，
  //    整体删除并把其中的键迁移到顶层；若含其他内容则原样保留
  const pnpmIdx = lines.findIndex((l) => /^pnpm\s*:/.test(l))
  if (pnpmIdx !== -1) {
    let endIdx = pnpmIdx + 1
    while (endIdx < lines.length && (/^\s/.test(lines[endIdx]) || lines[endIdx].trim() === '')) endIdx++
    let ours = true
    for (let i = pnpmIdx + 1; i < endIdx; i++) {
      const l = lines[i].trim()
      if (l === '') continue
      const isHeader = /^allowBuilds\s*:|^dangerouslyAllowAllBuilds\s*:/.test(l)
      const isEntry = /@.*:\s*true\s*$/.test(l)
      if (!isHeader && !isEntry) { ours = false; break }
      if (isEntry) {
        const m = /^["']?([^\s#]+?)["']?\s*:\s*true\s*$/.exec(l)
        if (m && m[1].includes('@')) keys.add(m[1])
      }
    }
    if (ours) for (let i = pnpmIdx; i < endIdx; i++) skip.add(i)
  }
  // 4) 重建：保留未标记行，末尾追加顶层设置
  const kept = []
  for (let i = 0; i < lines.length; i++) if (!skip.has(i)) kept.push(lines[i])
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop()
  let body = 'dangerouslyAllowAllBuilds: true\n'
  if (keys.size > 0) {
    body += 'allowBuilds:\n'
    for (const k of [...keys].sort()) body += '  ' + k + ': true\n'
  }
  let out = kept.join('\n')
  if (out && !out.endsWith('\n')) out += '\n'
  out += (out ? '\n' : '') + body
  if (!out.endsWith('\n')) out += '\n'
  await writeFile(p, out)
  return true
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
    spec: 'github:losebird/dsh-plugin-market#v0.1.28',
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
  return { source, notice, items: finalItems, installed, os: process.platform }
}

async function performInstall(args, job) {
  // 安装方式分发：按插件自身声明的方法执行
  const method = args.install && args.install.method ? args.install.method : (args.type === 'pack' ? 'pack' : 'dsh-plugin-add')
  if (method === 'npm-global' || method === 'command') {
    const cmd = (args.install && args.install.command) || (method === 'npm-global' ? 'npm install -g ' + (args.package || args.id) : '')
    if (!cmd) return finishJob(job, { status: 'error', error: '缺少安装命令' })
    const r = await runShellLogged(job, cmd, 600000, { fullAccess: true })
    if (!r.ok) return finishJob(job, { status: 'error', error: (r.stderr || '').trim() || '安装失败' })
    const state = await readState()
    const installed = state.installed || {}
    installed[args.id] = { type: 'bundle', spec: args.spec || cmd, package: args.package || null, at: new Date().toISOString(), installCmd: cmd }
    await writeState({ installed })
    return finishJob(job, { status: 'done', message: '安装完成: ' + cmd })
  }
  if (method === 'script') {
    // 官方脚本安装：按当前系统选择 README 记录的命令（darwin/linux 共用 bash 脚本，win32 走 PowerShell）
    const osCmds = (args.install && args.install.os) || {}
    let cmd = osCmds[process.platform]
    if (!cmd && process.platform !== 'win32') cmd = osCmds.darwin || osCmds.linux
    if (!cmd) return finishJob(job, { status: 'error', error: '该项目没有适配当前系统（' + process.platform + '）的安装脚本，请打开详情按 README 手动安装' })
    let execCmd = cmd
    if (process.platform === 'win32') execCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + String(cmd).replace(/"/g, '\\"') + '"'
    const r = await runShellLogged(job, execCmd, 600000, { fullAccess: true })
    if (!r.ok) {
      const tail = ((r.stderr || r.stdout || '').trim()).slice(-1200)
      return finishJob(job, { status: 'error', error: '安装脚本执行失败: ' + (tail || '未知错误') })
    }
    const state = await readState()
    const installed = state.installed || {}
    installed[args.id] = { type: 'bundle', spec: args.spec || cmd, package: args.package || null, at: new Date().toISOString(), installCmd: cmd }
    await writeState({ installed })
    return finishJob(job, { status: 'done', message: '安装完成（项目官方脚本）: ' + cmd })
  }
  if (method === 'desktop' || method === 'manual' || method === 'git-clone') {
    return finishJob(job, { status: 'error', error: '该插件需按其仓库说明安装，请打开详情查看 README' })
  }
  if (typeof args.spec !== 'string') return finishJob(job, { status: 'error', error: '参数错误' })
  if (args.type === 'bundle') {
    if (!validBundleSpec(args.spec)) return finishJob(job, { status: 'error', error: '非法的安装源 spec' })
    // 点击安装即授权：预先放行构建脚本，避免 pnpm 拦截一轮
    appendJobLine(job, '正在预放行构建脚本（pnpm allowBuilds）…')
    try { await allowBuild() } catch {}
    let r = await runShellLogged(job, 'dsh plugin --profile web add ' + q(args.spec), 300000, { fullAccess: true })
    if (!r.ok) {
      // 失败重试：命中 pnpm/CLI 构建拦截提示 → 放行 → 重试一次
      const combined = ((r.stdout || '') + '\n' + (r.stderr || '')).replace(/\u001b\[[0-9;]*m/g, '').replace(/\[.*?m/g, '')
      const hintBlocked = /allowBuilds|prepare script|approve-builds|Ignored build scripts/i.test(combined)
      if (hintBlocked) {
        // 从 pnpm 报错提示里解析它要求的精确 allowBuilds 键（形如
        // "  dsh-better-sidebar@https://codeload.github.com/...: true"），写入后重试
        const exactKeys = []
        const norm = combined.replace(/\r/g, '')
        // 兼容两种打印形式：dsh-better-sidebar@https://...: true 或 "dsh-better-sidebar@https://...": true
        const keyRe = /allowBuilds:\s*\n\s{2,}["']?([^\s#]+?)["']?: true/g
        let km
        while ((km = keyRe.exec(norm)) !== null) {
          if (km[1] && km[1].includes('@') && !exactKeys.includes(km[1])) exactKeys.push(km[1])
        }
        appendJobLine(job, '检测到 pnpm 构建脚本拦截，已解析 ' + exactKeys.length + ' 个放行键，正在重试…')
        try { await allowBuild(exactKeys) } catch {}
        r = await runShellLogged(job, 'dsh plugin --profile web add ' + q(args.spec), 300000, { fullAccess: true })
        if (!r.ok) {
          const tailOut = ((r.stdout || '').trim()).slice(-900)
          const tailErr = ((r.stderr || '').trim()).slice(-900)
          let yamlDump = ''
          try { yamlDump = await readFile(join(DSH_HOME, 'profiles', 'web', 'pnpm-workspace.yaml'), 'utf8') } catch (e) { yamlDump = '(读取失败: ' + e.message + ')' }
          return finishJob(job, { status: 'error', error: '已自动放行构建脚本（' + exactKeys.length + ' 个键），但重试仍失败。\n--- pnpm-workspace.yaml ---\n' + yamlDump.trim() + '\n--- stdout ---\n' + tailOut + '\n--- stderr ---\n' + tailErr })
        }
      } else {
        const tail = combined.trim().slice(-1800)
        return finishJob(job, { status: 'error', error: '安装失败: ' + (tail || 'dsh plugin add 失败') })
      }
    }
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
    return finishJob(job, { status: 'done', message: '已安装到 web profile，重启 dsh 后生效' + migrateNote })
  }
  if (args.type === 'pack') {
    const url = args.spec
    if (!/^(https:\/\/|file:\/\/)[^\s'"]+$/.test(url)) return finishJob(job, { status: 'error', error: '非法的下载地址' })
    const tmp = join(STATE_DIR, '.tmp-' + process.pid + '-' + Date.now())
    const tmpQ = q(tmp)
    const dl = url.startsWith('https://')
      ? 'curl -fsSL --max-time 300 ' + q(url) + ' -o ' + tmpQ + '/pkg.zip'
      : 'cp ' + q(url.slice(7)) + ' ' + tmpQ + '/pkg.zip'
    const r1 = await runShellLogged(job, 'rm -rf ' + tmpQ + ' && mkdir -p ' + tmpQ + ' && ' + dl, 330000, { fullAccess: true })
    if (!r1.ok) return finishJob(job, { status: 'error', error: '下载失败: ' + ((r1.stderr || '').trim() || '未知错误') })
    const r2 = await runShellLogged(job, 'cd ' + tmpQ + ' && unzip -o -q pkg.zip && test -f manifest.json', 60000, { fullAccess: true })
    if (!r2.ok) return finishJob(job, { status: 'error', error: '压缩包校验失败（缺少 manifest.json 或解压出错）' })
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(tmp, 'manifest.json'), 'utf8'))
    } catch {
      return finishJob(job, { status: 'error', error: 'manifest.json 解析失败' })
    }
    const packs = Array.isArray(manifest.skills) ? manifest.skills.map(String) : []
    const presets = Array.isArray(manifest.presets) ? manifest.presets.map(String) : []
    if (packs.length === 0 && presets.length === 0) return finishJob(job, { status: 'error', error: 'manifest 未声明任何 skill 或 preset' })
    for (const id of [...packs, ...presets]) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) return finishJob(job, { status: 'error', error: '非法目录 id: ' + id })
    }
    const state = await readState()
    const installed = state.installed || {}
    const conflicts = []
    for (const id of packs) if (!(id in installed)) conflicts.push('skill ' + id)
    for (const id of presets) if (!(id in installed)) conflicts.push('preset ' + id)
    if (conflicts.length > 0) return finishJob(job, { status: 'error', error: '目标目录已存在且非本市场管理，拒绝覆盖: ' + conflicts.join(', ') })
    // 更新模式：先删除本市场管理的旧目录
    try {
      for (const id of packs) await rm(join(SKILLS_ROOT, id), { recursive: true, force: true })
      for (const id of presets) await rm(join(PRESETS_ROOT, id), { recursive: true, force: true })
      for (const id of packs) {
        await mkdir(SKILLS_ROOT, { recursive: true })
        await runShellLogged(job, 'cp -R ' + q(join(tmp, 'skills', id)) + ' ' + q(SKILLS_ROOT) + '/', 60000, { fullAccess: true })
      }
      for (const id of presets) {
        await mkdir(PRESETS_ROOT, { recursive: true })
        await runShellLogged(job, 'cp -R ' + q(join(tmp, 'presets', id)) + ' ' + q(PRESETS_ROOT) + '/', 60000, { fullAccess: true })
      }
    } catch (e) {
      return finishJob(job, { status: 'error', error: '写入失败: ' + String(e && e.message ? e.message : e) })
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
    for (const id of packs) installed[id] = { type: 'pack', kind: 'skill', spec: url, at: new Date().toISOString() }
    for (const id of presets) installed[id] = { type: 'pack', kind: 'preset', spec: url, at: new Date().toISOString() }
    await writeState({ installed })
    const what = []
    if (packs.length > 0) what.push('skill: ' + packs.join(', '))
    if (presets.length > 0) what.push('preset: ' + presets.join(', '))
    return finishJob(job, { status: 'done', message: '已安装 ' + what.join('；') + (presets.length > 0 ? '（preset 需在新会话预设列表中选择后生效）' : '') })
  }
  return finishJob(job, { status: 'error', error: '未知条目类型' })
}

// 启动安装任务：校验参数 → 建任务 → 后台执行（路由立即返回 job id，客户端轮询进度）
function startInstall(args) {
  if (!args || typeof args !== 'object' || typeof args.id !== 'string' || typeof args.type !== 'string') {
    return { ok: false, error: '参数错误' }
  }
  const job = newJob(args)
  appendJobLine(job, '开始安装: ' + args.id)
  performInstall(args, job).catch((e) => {
    finishJob(job, { status: 'error', error: String(e && e.message ? e.message : e) })
  })
  return { ok: true, job: job.id }
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
  let request = { command, timeoutMs: timeoutMs || 60000, stdoutMaxBytes: 400000 }
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

// ── 安装任务注册表（进度弹窗轮询用） ─────────────────────────────────────────
const installJobs = new Map()
let jobSeq = 0
const MAX_JOB_LINES = 400

function newJob(args) {
  const id = 'j' + Date.now().toString(36) + '-' + (++jobSeq)
  const job = { id, args, proc: null, lines: [], status: 'running', message: null, error: null, at: Date.now() }
  installJobs.set(id, job)
  // 只保留最近 50 个任务；运行中的不清理
  while (installJobs.size > 50) {
    const first = installJobs.keys().next().value
    if (first === undefined) break
    if (installJobs.get(first).status === 'running') break
    installJobs.delete(first)
  }
  return job
}

function appendJobLines(job, delta) {
  if (!job || typeof delta !== 'string' || delta.length === 0) return
  const clean = delta.replace(/\u001b\[[0-9;]*m/g, '').replace(/\r/g, '')
  const parts = clean.split('\n')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) continue
    job.lines.push(parts[i].slice(0, 500))
    if (job.lines.length > MAX_JOB_LINES) job.lines.splice(0, job.lines.length - MAX_JOB_LINES)
  }
}

function appendJobLine(job, text) {
  appendJobLines(job, String(text) + '\n')
}

function pumpJob(job) {
  if (!job || !job.proc) return
  try {
    const o = job.proc.readOutput()
    if (o && typeof o.delta === 'string') appendJobLines(job, o.delta)
  } catch {}
}

function finishJob(job, { status, message, error }) {
  job.status = status
  job.message = message || null
  job.error = error || null
  job.proc = null
  appendJobLine(job, (status === 'done' ? '✔ ' : '✖ ') + (message || error || '结束'))
  return { ok: status === 'done', message, error }
}

// 流式 shell 执行：start + 增量读输出，写入任务日志供进度弹窗轮询；
// 同时累积完整输出（供失败分析/重试判定），带自有超时（start 不应用 timeout）。
async function runShellLogged(job, command, timeoutMs, opts = {}) {
  const shell = runShell.shellService
  if (!shell) {
    appendJobLine(job, 'shell 服务不可用')
    return { ok: false, stdout: '', stderr: 'shell 服务不可用' }
  }
  appendJobLine(job, '▶ ' + command)
  let request = { command, timeoutMs: timeoutMs || 60000, stdoutMaxBytes: 400000 }
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
    appendJobLine(job, 'shell.resolve 失败: ' + String(e))
    return { ok: false, stdout: '', stderr: 'shell.resolve 失败: ' + String(e) }
  }
  let proc
  try {
    proc = shell.start(spec)
  } catch (e) {
    appendJobLine(job, 'shell.start 失败: ' + String(e))
    return { ok: false, stdout: '', stderr: 'shell.start 失败: ' + String(e) }
  }
  job.proc = proc
  let collected = ''
  const timer = setInterval(() => {
    try {
      const o = proc.readOutput()
      if (o && typeof o.delta === 'string' && o.delta.length > 0) {
        collected = (collected + o.delta).slice(-400000)
        appendJobLines(job, o.delta)
      }
    } catch {}
  }, 250)
  const timeoutTimer = timeoutMs ? setTimeout(() => { try { proc.kill() } catch {} }, timeoutMs) : null
  await proc.done
  clearInterval(timer)
  if (timeoutTimer) clearTimeout(timeoutTimer)
  try {
    const o = proc.readOutput()
    if (o && typeof o.delta === 'string' && o.delta.length > 0) {
      collected = (collected + o.delta).slice(-400000)
      appendJobLines(job, o.delta)
    }
  } catch {}
  const ok = proc.status === 'completed' && proc.exitCode === 0
  appendJobLine(job, ok ? '✔ 命令完成 (exit 0)' : '✖ 命令结束: ' + (proc.signal ? '被信号 ' + proc.signal + ' 终止' : 'exit code ' + proc.exitCode))
  return { ok, stdout: collected, stderr: '' }
}

// ── 插件管理：已安装列表 / 禁用启用 / 删除 ──────────────────────────────────
const INTERNAL_RE = /^(@deepseek-ai\/|cordis:|typert:|schemastery:|cosmokit:|minato:|reggol:|yakumo:)/i
async function installedRows() {
  const manifest = await readProfileManifest()
  const { deps, bundles } = profileInstalled(manifest)
  const state = await readState()
  const marketInstalled = state.installed || {}
  const loader = installedRows.loader
  const entries = loader ? loader.entries() : []
  const marketRecFor = (name) => Object.values(marketInstalled).find((r) => r && (r.package === name || r.spec === name))
  const rows = []
  const seenNames = new Set()
  // 1) loader 当前挂载/认识的条目
  for (const e of entries) {
    const name = e.options && e.options.name
    const rowId = e.options && e.options.id
    if (!name) continue
    if (INTERNAL_RE.test(name)) continue
    const marketRec = marketRecFor(name)
    rows.push({
      id: rowId || name,
      name: name,
      enabled: bundles.has(name),
      disabled: !!e.disabled,
      failed: !!(e.fiber && e.fiber.error),
      source: marketRec ? 'market' : 'manual',
      at: marketRec && marketRec.at ? marketRec.at : null,
    })
    seenNames.add(name)
  }
  // 2) profile 依赖里已安装、但未挂载的包（典型：被禁用的 bundle 重启后不在 loader 里），
  //    保留在列表中，enabled=false，用户可一键重新启用
  for (const name of deps) {
    if (seenNames.has(name)) continue
    if (INTERNAL_RE.test(name)) continue
    const marketRec = marketRecFor(name)
    rows.push({
      id: name, name: name,
      enabled: false, disabled: false, failed: false, notMounted: true,
      source: marketRec ? 'market' : 'manual',
      at: marketRec && marketRec.at ? marketRec.at : null,
    })
    seenNames.add(name)
  }
  // 3) 市场状态里记录的安装（脚本安装/未 reconcile 的包），与上面去重合并
  for (const rec of Object.values(marketInstalled)) {
    const name = rec && (rec.package || rec.spec)
    if (!name || seenNames.has(name)) continue
    if (INTERNAL_RE.test(name)) continue
    rows.push({ id: name, name: name, enabled: bundles.has(name), disabled: false, failed: false, notMounted: true, source: 'market', at: rec.at || null })
    seenNames.add(name)
  }
  // 4) 其他 profile 里装着的包也列出来（标记来源，客户端提供迁移）
  const otherMap = await otherProfileMap()
  for (const [pkg, profs] of otherMap.entries()) {
    if (seenNames.has(pkg)) continue
    if (INTERNAL_RE.test(pkg)) continue
    rows.push({ id: pkg, name: pkg, enabled: false, disabled: false, failed: false, source: 'other', profile: profs[0], at: null })
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
          return json(res, 200, startInstall(body))
        }
        if (pathname === '/plugin-market/job' && req.method === 'GET') {
          const url = new URL(req.url, 'http://x')
          const id = url.searchParams.get('id') || ''
          const job = installJobs.get(id)
          if (!job) return json(res, 200, { ok: false, error: '任务不存在' })
          pumpJob(job)
          return json(res, 200, { ok: true, id: job.id, status: job.status, lines: job.lines, message: job.message, error: job.error })
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
