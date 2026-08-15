// dsh-plugin-market host 半片：REST API + 安装/卸载执行
// /api/market/list      GET   → { source, notice, items, installed }
// /api/market/install   POST  → { ok, message | error }
// /api/market/uninstall POST  → { ok, message | error }
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REGISTRY_URL = process.env.DSH_MARKET_REGISTRY || 'https://raw.githubusercontent.com/losebird/dsh-plugin-market/main/registry/all.json'
const STATE_DIR = join(homedir(), '.dsh', 'plugin-market')
const STATE_FILE = join(STATE_DIR, 'state.json')
const SKILLS_ROOT = join(homedir(), '.agents', 'skills')
const PRESETS_ROOT = join(homedir(), '.dsh', '.agent-presets')

const DEMO_ITEMS = [
  {
    id: 'dsh-plugin-market',
    name: 'DSH 插件市场',
    type: 'bundle',
    package: 'dsh-plugin-market',
    spec: 'github:losebird/dsh-plugin-market#v0.1.2',
    version: 'v0.1.2',
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
    spec: 'https://losebird.github.io/dsh-plugin-market/registry/examples/demo-hello/demo-hello.zip',
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
  return { source, notice, items: items || DEMO_ITEMS, installed }
}

async function install(args) {
  if (!args || typeof args !== 'object' || typeof args.id !== 'string' || typeof args.type !== 'string' || typeof args.spec !== 'string') {
    return { ok: false, error: '参数错误' }
  }
  if (args.type === 'bundle') {
    if (!validBundleSpec(args.spec)) return { ok: false, error: '非法的安装源 spec' }
    const r = await runShell('dsh plugin --profile web add ' + q(args.spec), 300000)
    if (!r.ok) return { ok: false, error: (r.stderr || '').trim() || 'dsh plugin add 失败' }
    const state = await readState()
    const installed = state.installed || {}
    installed[args.id] = {
      type: 'bundle',
      spec: args.spec,
      package: typeof args.package === 'string' && args.package ? args.package : args.id,
      at: new Date().toISOString(),
    }
    await writeState({ installed })
    return { ok: true, message: '已安装到 web profile，重启 dsh 后生效' }
  }
  if (args.type === 'pack') {
    const url = args.spec
    if (!/^(https:\/\/|file:\/\/)[^\s'"]+$/.test(url)) return { ok: false, error: '非法的下载地址' }
    const tmp = join(STATE_DIR, '.tmp-' + process.pid + '-' + Date.now())
    const tmpQ = q(tmp)
    const dl = url.startsWith('https://')
      ? 'curl -fsSL --max-time 300 ' + q(url) + ' -o ' + tmpQ + '/pkg.zip'
      : 'cp ' + q(url.slice(7)) + ' ' + tmpQ + '/pkg.zip'
    const r1 = await runShell('rm -rf ' + tmpQ + ' && mkdir -p ' + tmpQ + ' && ' + dl, 330000)
    if (!r1.ok) return { ok: false, error: '下载失败: ' + ((r1.stderr || '').trim() || '未知错误') }
    const r2 = await runShell('cd ' + tmpQ + ' && unzip -o -q pkg.zip && test -f manifest.json', 60000)
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
        await runShell('cp -R ' + q(join(tmp, 'skills', id)) + ' ' + q(SKILLS_ROOT) + '/', 60000)
      }
      for (const id of presets) {
        await mkdir(PRESETS_ROOT, { recursive: true })
        await runShell('cp -R ' + q(join(tmp, 'presets', id)) + ' ' + q(PRESETS_ROOT) + '/', 60000)
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
    const r = await runShell('dsh plugin --profile web remove ' + q(name), 300000)
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
async function runShell(command, timeoutMs) {
  const shell = runShell.shellService
  if (!shell) return { ok: false, stdout: '', stderr: 'shell 服务不可用' }
  let spec
  try {
    spec = shell.resolve({ command, timeoutMs: timeoutMs || 60000 })
  } catch (e) {
    return { ok: false, stdout: '', stderr: 'shell.resolve 失败: ' + String(e) }
  }
  try {
    const result = await shell.run(spec)
    return {
      ok: result.exitCode === 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
    }
  } catch (e) {
    return { ok: false, stdout: '', stderr: 'shell.run 失败: ' + String(e) }
  }
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

export default function (ctx) {
  const webServer = ctx.get('webServer')
  const shell = ctx.get('shell')
  if (webServer === undefined || shell === undefined) return
  runShell.shellService = shell

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/api/market',
    handler: async (req, res) => {
      const pathname = (req.url || '').split('?')[0]
      try {
        if (pathname === '/api/market/list' && req.method === 'GET') return json(res, 200, await list())
        if (pathname === '/api/market/install' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await install(body))
        }
        if (pathname === '/api/market/uninstall' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          return json(res, 200, await uninstall(body))
        }
        json(res, 404, { ok: false, error: 'not found' })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-plugin-market: /api/market routes')
}
