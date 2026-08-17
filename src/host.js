// dsh-market host 半片：REST API + 安装/卸载执行
// /plugin-market/list      GET   → { source, notice, items, installed }
// /plugin-market/install   POST  → { ok, job | error }   body: { id } 仅
// /plugin-market/uninstall POST  → { ok, job | error }   body: { id } 仅
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { canOneClick, isMarketId, isPackUrl, safeBundleSpec } from './safe-spec.js'

const REGISTRY_URL = process.env.DSH_MARKET_REGISTRY || 'https://raw.githubusercontent.com/losebird/dsh-plugin-market/main/registry/all.json'
const STATE_DIR = join(homedir(), '.dsh', 'plugin-market')
const STATE_FILE = join(STATE_DIR, 'state.json')
const SKILLS_ROOT = join(homedir(), '.agents', 'skills')
const PRESETS_ROOT = join(homedir(), '.dsh', '.agent-presets')
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE_MANIFEST = join(DSH_HOME, 'profiles', 'web', 'package.json')

const README_VARIANTS = [
  'README.md', 'readme.md',
  'README_EN.md', 'README.EN.md', 'README.en.md', 'README_en.md',
  'README_zh.md', 'README_ZH.md', 'README.zh.md', 'README_zh-CN.md', 'README_zh_CN.md',
  'README_CN.md', 'README.CN.md', 'README.zh-CN.md', 'README.zh_CN.md',
]

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
    package: '@ace-zone/dsh-market',
    spec: '@ace-zone/dsh-market',
    version: 'v0.1.57',
    author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: 'DSH 的社区插件市场本体：按钮 + 卡片弹窗 + 一键安装。',
    tags: ['market', 'ui'],
    license: 'MIT',
    downloads: 0,
    stars: 0,
    verified: true,
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

async function pathExists(p) {
  try { await stat(p); return true } catch { return false }
}

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

async function fetchRegistryItems() {
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const parsed = await res.json()
      if (parsed && Array.isArray(parsed.items)) return { items: parsed.items, source: 'remote', notice: null }
    }
    return { items: DEMO_ITEMS, source: 'demo', notice: 'registry 数据格式异常，已回退演示数据' }
  } catch {
    return { items: DEMO_ITEMS, source: 'demo', notice: '远程 registry 暂不可用，已回退演示数据' }
  }
}

async function findItemById(id) {
  const { items } = await fetchRegistryItems()
  return items.find((it) => it && it.id === id) || null
}

async function list() {
  const state = await readState()
  const installed = state.installed && typeof state.installed === 'object' ? state.installed : {}
  const fetched = await fetchRegistryItems()
  const finalItems = fetched.items.map((it) => ({ ...it, oneClick: canOneClick(it) }))
  const manifest = await readProfileManifest()
  const { deps, bundles } = profileInstalled(manifest)
  const otherMap = await otherProfileMap()
  for (const it of finalItems) {
    if (!it.package) continue
    if ((deps.has(it.package) || bundles.has(it.package)) && !(it.id in installed)) {
      installed[it.id] = { type: 'bundle', spec: it.spec || '', package: it.package, source: 'manual' }
    } else if (!(it.id in installed) && otherMap.has(it.package)) {
      installed[it.id] = { type: 'bundle', spec: it.spec || '', package: it.package, source: 'other', profile: otherMap.get(it.package)[0] }
    }
  }
  return { source: fetched.source, notice: fetched.notice, items: finalItems, installed, os: process.platform }
}

async function installBundle(item, job) {
  const spec = safeBundleSpec(item)
  if (!spec) {
    return finishJob(job, { status: 'error', error: '该插件没有可一键安装的 npm/tgz 源，请打开仓库按说明安装' })
  }
  const isMarketSelf = item.package === '@ace-zone/dsh-market' || item.package === 'dsh-plugin-market'
    || item.id === 'dsh-plugin-market' || spec === '@ace-zone/dsh-market'
  if (isMarketSelf) {
    const manifest0 = await readProfileManifest()
    const deps0 = (manifest0 && manifest0.dependencies) || {}
    if (deps0['dsh-plugin-market']) {
      appendJobLine(job, '检测到旧版包名 dsh-plugin-market，先移除再安装 @ace-zone/dsh-market …')
      const rmRes = await runShellLogged(job, 'dsh plugin --profile web remove dsh-plugin-market', 300000, { fullAccess: true })
      if (!rmRes.ok) appendJobLine(job, '旧名移除未成功（继续安装新名，稍后可手动清理）')
    }
  }
  appendJobLine(job, '正在安装 npm/tgz: ' + spec)
  const r = await runShellLogged(job, 'dsh plugin --profile web add ' + q(spec), 300000, { fullAccess: true })
  if (!r.ok) {
    const tail = ((r.stdout || '') + '\n' + (r.stderr || '')).trim().slice(-1800)
    return finishJob(job, { status: 'error', error: '安装失败: ' + (tail || 'dsh plugin add 失败') })
  }
  const migratedFrom = []
  const pkgName = typeof item.package === 'string' && item.package ? item.package : (isNpmBareName(spec) ? spec : null)
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
  installed[item.id] = {
    type: 'bundle',
    spec,
    package: pkgName || item.id,
    at: new Date().toISOString(),
  }
  await writeState({ installed })
  const migrateNote = migratedFrom.length > 0 ? '（已自动从其他 profile 迁移: ' + migratedFrom.join(', ') + '）' : ''
  return finishJob(job, { status: 'done', message: '已安装到 web profile，重启 dsh 后生效' + migrateNote })
}

function isNpmBareName(spec) {
  return typeof spec === 'string' && !spec.includes('://') && !spec.startsWith('github:') && !spec.startsWith('git+')
}

async function installPack(item, job) {
  const url = item.spec
  if (!isPackUrl(url)) return finishJob(job, { status: 'error', error: '非法的下载地址' })
  const tmp = join(STATE_DIR, '.tmp-' + process.pid + '-' + Date.now())
  const tmpQ = q(tmp)
  const r1 = await runShellLogged(job, 'rm -rf ' + tmpQ + ' && mkdir -p ' + tmpQ + ' && curl -fsSL --max-time 300 ' + q(url) + ' -o ' + tmpQ + '/pkg.zip', 330000, { fullAccess: true })
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
    if (!isMarketId(id)) return finishJob(job, { status: 'error', error: '非法目录 id: ' + id })
  }
  const state = await readState()
  const installed = state.installed || {}
  const parent = installed[item.id]
  const managedSkills = (parent && Array.isArray(parent.skills)) ? parent.skills : []
  const managedPresets = (parent && Array.isArray(parent.presets)) ? parent.presets : []
  const conflicts = []
  for (const id of packs) {
    if (await pathExists(join(SKILLS_ROOT, id)) && !(id in installed) && managedSkills.indexOf(id) === -1) {
      conflicts.push('skill ' + id)
    }
  }
  for (const id of presets) {
    if (await pathExists(join(PRESETS_ROOT, id)) && !(id in installed) && managedPresets.indexOf(id) === -1) {
      conflicts.push('preset ' + id)
    }
  }
  if (conflicts.length > 0) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    return finishJob(job, { status: 'error', error: '目标目录已存在且非本市场管理，拒绝覆盖: ' + conflicts.join(', ') })
  }
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
  const at = new Date().toISOString()
  installed[item.id] = { type: 'pack', spec: url, skills: packs, presets, at }
  for (const id of packs) {
    if (id !== item.id) installed[id] = { type: 'pack', kind: 'skill', spec: url, parent: item.id, at }
  }
  for (const id of presets) {
    if (id !== item.id) installed[id] = { type: 'pack', kind: 'preset', spec: url, parent: item.id, at }
  }
  await writeState({ installed })
  const what = []
  if (packs.length > 0) what.push('skill: ' + packs.join(', '))
  if (presets.length > 0) what.push('preset: ' + presets.join(', '))
  return finishJob(job, { status: 'done', message: '已安装 ' + what.join('；') + (presets.length > 0 ? '（preset 需在新会话预设列表中选择后生效）' : '') })
}

async function performInstall(id, job) {
  const item = await findItemById(id)
  if (!item) return finishJob(job, { status: 'error', error: '未找到该插件' })
  if (item.status === 'unavailable') return finishJob(job, { status: 'error', error: '仓库已下线，无法安装' })
  if (item.type === 'pack') return installPack(item, job)
  if (item.type === 'bundle') return installBundle(item, job)
  return finishJob(job, { status: 'error', error: '未知条目类型' })
}

function startInstall(args) {
  if (!args || typeof args !== 'object' || !isMarketId(args.id)) {
    return { ok: false, error: '参数错误' }
  }
  const job = newJob({ id: args.id })
  appendJobLine(job, '开始安装: ' + args.id)
  performInstall(args.id, job).catch((e) => {
    finishJob(job, { status: 'error', error: String(e && e.message ? e.message : e) })
  })
  return { ok: true, job: job.id }
}

async function performUninstall(args, job) {
  const state = await readState()
  const installed = state.installed || {}
  const rec = installed[args.id]
  if (!rec) return finishJob(job, { status: 'error', error: '该条目不是本市场安装的' })
  if (rec.type === 'bundle') {
    const name = typeof rec.package === 'string' && rec.package ? rec.package : args.id
    appendJobLine(job, '正在从各 profile 卸载: ' + name)
    const res = await removeFromAllProfiles(name, job)
    if (!res.ok) return finishJob(job, { status: 'error', error: res.error })
    delete installed[args.id]
    await writeState({ installed })
    const where = res.cleaned.length > 0 ? res.cleaned.join(', ') : 'web'
    return finishJob(job, { status: 'done', message: '已从 ' + where + ' 卸载 ' + name + '，重启 dsh 后生效' })
  }
  if (rec.type === 'pack') {
    const skills = Array.isArray(rec.skills) ? rec.skills : (rec.kind === 'preset' ? [] : [args.id])
    const presets = Array.isArray(rec.presets) ? rec.presets : (rec.kind === 'preset' ? [args.id] : [])
    try {
      for (const id of skills) await rm(join(SKILLS_ROOT, id), { recursive: true, force: true })
      for (const id of presets) await rm(join(PRESETS_ROOT, id), { recursive: true, force: true })
    } catch (e) {
      return finishJob(job, { status: 'error', error: '删除失败: ' + String(e && e.message ? e.message : e) })
    }
    delete installed[args.id]
    for (const id of [...skills, ...presets]) delete installed[id]
    if (rec.parent) delete installed[rec.parent]
    await writeState({ installed })
    return finishJob(job, { status: 'done', message: '已卸载 ' + args.id })
  }
  return finishJob(job, { status: 'error', error: '未知安装类型' })
}

function startUninstall(args) {
  if (!args || typeof args !== 'object' || !isMarketId(args.id)) return { ok: false, error: '参数错误' }
  const job = newJob({ id: args.id })
  appendJobLine(job, '开始卸载: ' + args.id)
  performUninstall({ id: args.id }, job).catch((e) => {
    finishJob(job, { status: 'error', error: String(e && e.message ? e.message : e) })
  })
  return { ok: true, job: job.id }
}

async function performRemove(args, job) {
  const name = args && args.name
  if (!name) return finishJob(job, { status: 'error', error: '参数错误' })
  appendJobLine(job, '正在从各 profile 卸载: ' + name)
  const res = await removeFromAllProfiles(name, job)
  if (!res.ok) return finishJob(job, { status: 'error', error: res.error })
  const state = await readState()
  const installed = state.installed || {}
  for (const k of Object.keys(installed)) {
    const rec = installed[k]
    if (rec && (rec.package === name || rec.spec === name || k === name)) delete installed[k]
  }
  await writeState({ installed })
  const where = res.cleaned.length > 0 ? res.cleaned.join(', ') : 'web'
  return finishJob(job, { status: 'done', message: '已从 ' + where + ' 卸载 ' + name + '，重启 dsh 后生效' })
}

function startRemove(args) {
  if (!args || typeof args !== 'object' || typeof args.name !== 'string' || !args.name) return { ok: false, error: '参数错误' }
  const job = newJob(args)
  appendJobLine(job, '开始删除: ' + args.name)
  performRemove(args, job).catch((e) => {
    finishJob(job, { status: 'error', error: String(e && e.message ? e.message : e) })
  })
  return { ok: true, job: job.id }
}

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

const installJobs = new Map()
let jobSeq = 0
const MAX_JOB_LINES = 400

function newJob(args) {
  const id = 'j' + Date.now().toString(36) + '-' + (++jobSeq)
  const job = { id, args, proc: null, lines: [], status: 'running', message: null, error: null, at: Date.now() }
  installJobs.set(id, job)
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

const INTERNAL_RE = /^(@deepseek-ai\/|cordis:|typert:|schemastery:|cosmokit:|minato:|reggol:|yakumo:)/i
async function installedRows() {
  const manifest = await readProfileManifest()
  const { deps, bundles } = profileInstalled(manifest)
  const state = await readState()
  const marketInstalled = state.installed || {}
  const loader = installedRows.loader
  const entries = loader ? [...loader.entries()] : []
  const otherMap = await otherProfileMap()
  const loaderNames = new Set()
  for (const e of entries) {
    const name = e.options && e.options.name
    if (name) loaderNames.add(name)
  }
  const inProfileOrLoader = (name) => deps.has(name) || bundles.has(name) || otherMap.has(name) || loaderNames.has(name)
  const marketRecFor = (name) => Object.values(marketInstalled).find((r) => r && (r.package === name || r.spec === name))
  const rows = []
  const seenNames = new Set()
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
  let stateDirty = false
  for (const [k, rec] of Object.entries(marketInstalled)) {
    const name = rec && (rec.package || rec.spec || k)
    if (!name || seenNames.has(name)) continue
    if (INTERNAL_RE.test(name)) continue
    let stillInstalled = false
    if (rec.type === 'pack') {
      const skillIds = Array.isArray(rec.skills) ? rec.skills : (rec.kind === 'preset' ? [] : [k])
      const presetIds = Array.isArray(rec.presets) ? rec.presets : (rec.kind === 'preset' ? [k] : [])
      stillInstalled = false
      for (const id of skillIds) { if (await pathExists(join(SKILLS_ROOT, id))) { stillInstalled = true; break } }
      if (!stillInstalled) {
        for (const id of presetIds) { if (await pathExists(join(PRESETS_ROOT, id))) { stillInstalled = true; break } }
      }
    } else if (rec.installCmd) {
      stillInstalled = true
    } else {
      stillInstalled = inProfileOrLoader(name)
    }
    if (!stillInstalled) {
      delete marketInstalled[k]
      stateDirty = true
      continue
    }
    rows.push({ id: name, name: name, enabled: bundles.has(name), disabled: false, failed: false, notMounted: true, source: 'market', at: rec.at || null })
    seenNames.add(name)
  }
  if (stateDirty) await writeState({ installed: marketInstalled })
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

async function removeFromAllProfiles(name, job) {
  const cleaned = []
  const webManifest = await readProfileManifest()
  const webDeps = new Set(Object.keys((webManifest && webManifest.dependencies) || {}))
  const webBundles = new Set((webManifest && webManifest.dsh && webManifest.dsh.profile && webManifest.dsh.profile.bundles) || [])
  if (webDeps.has(name) || webBundles.has(name)) {
    const r = job
      ? await runShellLogged(job, 'dsh plugin --profile web remove ' + q(name), 300000, { fullAccess: true })
      : await runShell('dsh plugin --profile web remove ' + q(name), 300000, { fullAccess: true })
    if (!r.ok) return { ok: false, error: (r.stderr || '').trim() || 'dsh plugin remove 失败' }
    cleaned.push('web')
  }
  const otherMap = await otherProfileMap()
  for (const prof of (otherMap.get(name) || [])) {
    const r = job
      ? await runShellLogged(job, 'dsh plugin --profile ' + q(prof) + ' remove ' + q(name), 300000, { fullAccess: true })
      : await runShell('dsh plugin --profile ' + q(prof) + ' remove ' + q(name), 300000, { fullAccess: true })
    if (r.ok) cleaned.push(prof)
  }
  return { ok: true, cleaned }
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
    console.log('[dsh-market] host apply: webServer=' + (webServer !== undefined) + ' shell=' + (shell !== undefined))
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
        if (pathname === '/plugin-market/job-cancel' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          const job = installJobs.get(String(body.id || ''))
          if (!job) return json(res, 200, { ok: false, error: '任务不存在' })
          if (typeof job.abort === 'function') { try { job.abort() } catch {} }
          if (job.proc && typeof job.proc.kill === 'function') { try { job.proc.kill() } catch {} }
          return json(res, 200, { ok: true })
        }
        if (pathname === '/plugin-market/uninstall' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, startUninstall(body))
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
          return json(res, 200, startRemove(body))
        }
        if (pathname === '/plugin-market/readme' && req.method === 'GET') {
          const url = new URL(req.url, 'http://x')
          const repo = url.searchParams.get('repo') || ''
          const fileParam = url.searchParams.get('file') || 'README.md'
          if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json(res, 400, { ok: false, error: 'bad repo' })
          if (!/^readme[.\-_a-z0-9]*\.md$/i.test(fileParam) || fileParam.length > 64) return json(res, 400, { ok: false, error: 'bad file' })
          try {
            const base = 'https://raw.githubusercontent.com/' + repo + '/HEAD/'
            const r = await fetch(base + fileParam, { signal: AbortSignal.timeout(8000) })
            if (!r.ok) return json(res, 200, { ok: false, error: 'no readme' })
            const markdown = await r.text()
            return json(res, 200, { ok: true, markdown, file: fileParam })
          } catch (e) {
            return json(res, 200, { ok: false, error: String(e && e.message ? e.message : e) })
          }
        }
        if (pathname === '/plugin-market/readme-variants' && req.method === 'GET') {
          const url = new URL(req.url, 'http://x')
          const repo = url.searchParams.get('repo') || ''
          if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json(res, 400, { ok: false, error: 'bad repo' })
          const base = 'https://raw.githubusercontent.com/' + repo + '/HEAD/'
          const variants = []
          const seen = new Set()
          await Promise.all(README_VARIANTS.map(async (f) => {
            const key = f.toLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            try {
              const r = await fetch(base + f, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
              if (r.ok) variants.push(f)
            } catch {}
          }))
          variants.sort((a, b) => (a.toLowerCase() === 'readme.md' ? -1 : b.toLowerCase() === 'readme.md' ? 1 : 0))
          return json(res, 200, { ok: true, variants })
        }
        json(res, 404, { ok: false, error: 'not found' })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-plugin-market: /plugin-market routes')
  },
}
