import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CaretRight, CheckCircle, CircleNotch, Copy, DownloadSimple,
  GithubLogo, MagnifyingGlass, Package, Plug, Star, UploadSimple, Warning, X,
} from '@phosphor-icons/react'

const GITHUB_REPO = 'losebird/dsh-plugin-market'
const PR_FILE_BASE = 'https://github.com/' + GITHUB_REPO + '/new/main'
const REGISTRY_BASE = import.meta.env.BASE_URL

const DEMO_ITEMS = [
  {
    id: 'dsh-plugin-market', name: 'DSH 插件市场', type: 'bundle', package: 'dsh-plugin-market',
    repo: 'losebird/dsh-plugin-market', spec: 'github:losebird/dsh-plugin-market#main',
    version: 'v0.1.0', author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: 'DSH 的社区插件市场本体：按钮 + 卡片弹窗 + 一键安装。',
    tags: ['market', 'ui'], license: 'MIT', downloads: 0, stars: 0, demo: true,
  },
  {
    id: 'demo-hello', name: 'Demo Hello Skill', type: 'pack',
    repo: 'losebird/dsh-plugin-market', spec: 'https://example.com/demo-hello.zip',
    version: 'v0.1.0', author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: '演示扩展包：验证市场安装链路。',
    tags: ['demo', 'skill'], license: 'MIT', downloads: 0, stars: 0, demo: true,
  },
]

async function loadRegistry() {
  const grab = async (name) => {
    const res = await fetch(REGISTRY_BASE + 'registry/' + name)
    return res.ok ? res.json() : null
  }
  const all = await grab('all.json')
  if (all && Array.isArray(all.items)) return all.items
  const curated = await grab('index.json')
  const auto = await grab('auto.json')
  const items = [...((curated && curated.items) || []), ...((auto && auto.items) || [])]
  return items
}

function fmtNum(n) {
  if (typeof n !== 'number') return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function installCommand(item) {
  return item.type === 'bundle' ? 'dsh plugin --profile web add ' + item.spec : ''
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/* ── 小组件 ───────────────────────────────────────── */
function Badges({ item }) {
  return (
    <div className="badges">
      {item.type === 'pack' && <span className="badge badge-pack">扩展包</span>}
      {item.auto && <span className="badge badge-auto">自动收录</span>}
      {item.demo && <span className="badge">演示</span>}
      {item.status === 'unavailable' && <span className="badge badge-off">已下线</span>}
    </div>
  )
}

function Card({ item, onOpen }) {
  const cmd = installCommand(item)
  return (
    <div className="card">
      <div className="card-top">
        <div className="card-name">{item.name}</div>
        <Badges item={item} />
      </div>
      <div className="card-author">
        {item.author && item.author.url
          ? <a href={item.author.url} target="_blank" rel="noreferrer">{item.author.name}</a>
          : (item.author && item.author.name) || '匿名作者'}
      </div>
      <div className="card-desc">{item.description || ''}</div>
      <div className="card-stats">
        <span title="下载量"><DownloadSimple size={14} />{fmtNum(item.downloads)}</span>
        <span title="GitHub 星标"><Star size={14} />{fmtNum(item.stars)}</span>
        {item.version && <span>{item.version}</span>}
      </div>
      <div className="card-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onOpen(item)} disabled={item.status === 'unavailable'}>
          详情<CaretRight size={13} />
        </button>
        {cmd && <button className="btn btn-ghost btn-sm" onClick={() => copyText(cmd)} title="复制安装命令">复制命令</button>}
        <span className="spacer" />
      </div>
    </div>
  )
}

function DetailModal({ item, onClose }) {
  const [copied, setCopied] = useState(false)
  const cmd = installCommand(item)
  const doCopy = async () => { if (await copyText(cmd)) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{item.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
        <Badges item={item} />
        <div className="meta-row">
          <span>作者 {item.author && item.author.name ? item.author.name : '未知'}</span>
          {item.version && <span>版本 {item.version}</span>}
          <span>许可 {item.license || 'UNKNOWN'}</span>
          <span>下载 {fmtNum(item.downloads)}</span>
          <span><Star size={13} /> {fmtNum(item.stars)}</span>
        </div>
        {item.longDescription && <div className="long-desc">{item.longDescription}</div>}
        {item.type === 'bundle' ? (
          <>
            <div className="install-box">
              <code>{cmd}</code>
              <button className="btn btn-primary btn-sm" onClick={doCopy}>{copied ? '已复制' : '复制'}</button>
            </div>
            <p className="card-desc">在 DSH 应用内打开侧栏「插件市场」弹窗点安装即可，安装后重启 DSH 生效。</p>
          </>
        ) : (
          <>
            {/^https:\/\//.test(item.spec || '') && (
              <a className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} href={item.spec} target="_blank" rel="noreferrer">
                <DownloadSimple size={15} />下载扩展包 zip
              </a>
            )}
            <p className="card-desc">下载 zip 后在 DSH 插件市场弹窗中选择「从本地导入」，或手动解压到对应目录（skill 放 ~/.agents/skills/，preset 放 ~/.dsh/.agent-presets/）。</p>
          </>
        )}
        <div className="card-actions">
          <a className="btn btn-ghost btn-sm" href={'https://github.com/' + item.repo} target="_blank" rel="noreferrer">
            <GithubLogo size={14} />查看仓库
          </a>
          {item.status === 'unavailable' && (
            <span style={{ color: 'var(--error)', fontSize: 13 }}><Warning size={13} /> 该条目仓库已删除或转为私有</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 主页面 ───────────────────────────────────────── */
function Home({ items, status, onGoSubmit, onOpenDetail }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const [sort, setSort] = useState('stars')

  const tags = useMemo(() => {
    const counts = new Map()
    for (const it of items) for (const t of it.tags || []) counts.set(t, (counts.get(t) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [items])

  const filtered = useMemo(() => {
    let list = items.filter((it) => {
      if (tag && !(it.tags || []).includes(tag)) return false
      if (!q) return true
      const hay = [it.name, it.description, it.id, (it.tags || []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q.toLowerCase())
    })
    list = [...list].sort((a, b) => {
      if (sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0)
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
      return (b.stars || 0) - (a.stars || 0)
    })
    return list
  }, [items, q, tag, sort])

  return (
    <>
      <section className="shell hero">
        <div>
          <h1>给 DSH 装插件，<br /><span className="accent">一个按钮的事</span></h1>
          <p className="hero-sub">
            社区插件、skill 与 preset 扩展包的一站式目录。数据来自 GitHub、采集过程透明，安装走 dsh plugin 官方机制，全部开源可审计。
          </p>
          <div className="hero-ctas">
            <a className="btn btn-primary" href="#directory">浏览目录<CaretRight size={15} /></a>
            <button className="btn btn-ghost" onClick={onGoSubmit}><UploadSimple size={15} />上传插件</button>
          </div>
        </div>
        <div className="term">
          <div className="term-bar"><Plug size={14} /> 安装方式</div>
          <div className="term-body">
            <div><span className="prompt">$</span> dsh plugin --profile web add github:owner/repo#tag</div>
            <div className="out">+ dsh-plugin-market@v0.1.0 installed</div>
            <div><span className="prompt">$</span> dsh web</div>
            <div className="out">restart dsh to activate plugins</div>
          </div>
        </div>
      </section>

      <section className="shell section" id="directory">
        <div className="section-head">
          <h2>插件目录</h2>
          <span className="count">{items.length} 个条目 · 数据源 GitHub · 每日自动采集</span>
        </div>
        {status === 'demo' && (
          <div className="strip strip-demo"><Warning size={16} /> registry 暂不可用，当前展示演示数据。推送仓库后自动切换。</div>
        )}
        <div className="toolbar">
          <div className="search">
            <MagnifyingGlass size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、简介或标签" aria-label="搜索插件" />
          </div>
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序">
            <option value="stars">按星标</option>
            <option value="downloads">按下载量</option>
            <option value="name">按名称</option>
          </select>
        </div>
        {tags.length > 0 && (
          <div className="tag-row">
            <button className={'tag-chip' + (tag === null ? ' on' : '')} onClick={() => setTag(null)}>全部</button>
            {tags.map((t) => (
              <button key={t} className={'tag-chip' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
            ))}
          </div>
        )}
        {status === 'loading' ? (
          <div className="grid">{Array.from({ length: 6 }).map((_, i) => <div className="skeleton" key={i} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="state">
            <Package size={34} />
            <p>{items.length === 0 ? '目录还是空的。上传第一个插件？' : '没有匹配的插件，换个关键词试试。'}</p>
            {items.length === 0 && <button className="btn btn-primary" onClick={onGoSubmit}>上传插件</button>}
          </div>
        ) : (
          <div className="grid">{filtered.map((it) => <Card key={it.id} item={it} onOpen={onOpenDetail} />)}</div>
        )}
      </section>

      <section className="shell how" id="how">
        <div className="how-left">
          <h2>工作原理</h2>
          <p>没有私有后端。插件数据就是仓库里的 JSON 文件，每天由 GitHub Actions 自动采集、去重、合并，网站与 DSH 弹窗读的是同一份数据。</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-num">01</div>
            <div>
              <h3>作者发布</h3>
              <p>插件作者在自己的 GitHub 仓库发 Release（bundle 包或 zip 扩展包），构建产物直接提交进仓库，不依赖安装时编译。</p>
            </div>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <div>
              <h3>PR 上架或自动收录</h3>
              <p>上传页生成条目 JSON，作者向 <code>registry/curated/</code> 提 PR，合并即上架；仓库打了 topic 的插件也会被每日任务自动收录。</p>
            </div>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <div>
              <h3>每日合并去重</h3>
              <p>采集任务汇总下载量与星标，按包名和仓库去重，curated 条目优先，输出 <code>registry/all.json</code>。</p>
            </div>
          </div>
          <div className="step">
            <div className="step-num">04</div>
            <div>
              <h3>DSH 内一键安装</h3>
              <p>用户在 DSH 侧栏的插件市场弹窗里点安装，等价执行 <code>dsh plugin --profile web add</code>，安装前有信任确认，重启后生效。</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

/* ── 上传页 ───────────────────────────────────────── */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const BUNDLE_SPEC_RE = /^(github:|git\+)[^\s"']+(#[^\s"']+)?$|^@?[\w.-]+\/[\w.-]+$|^[\w@.-]+$/
const PACK_SPEC_RE = /^https:\/\/[^\s"']+$/

function SubmitPage({ onBack }) {
  const [form, setForm] = useState({
    type: 'bundle', id: '', name: '', repo: '', spec: '', version: '',
    package: '', description: '', longDescription: '', tags: '', license: 'MIT',
    authorName: '', authorUrl: '', skills: '', presets: '',
  })
  const [errors, setErrors] = useState({})
  const [copied, setCopied] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setType = (t) => setForm((f) => ({ ...f, type: t }))

  const entry = useMemo(() => {
    const e = {
      id: form.id, name: form.name, type: form.type, repo: form.repo, spec: form.spec,
      description: form.description, license: form.license,
      author: { name: form.authorName, url: form.authorUrl },
    }
    if (form.version) e.version = form.version
    if (form.longDescription) e.longDescription = form.longDescription
    if (form.tags) e.tags = form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
    if (form.authorUrl && /^https:\/\//.test(form.authorUrl)) e.author.url = form.authorUrl
    if (form.type === 'bundle' && form.package) e.package = form.package
    if (form.type === 'pack') {
      const skills = form.skills.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      const presets = form.presets.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      if (skills.length || presets.length) e.contents = { skills, presets }
    }
    return e
  }, [form])

  const validate = () => {
    const e = {}
    if (!ID_RE.test(form.id)) e.id = '小写字母、数字、点、下划线、连字符，字母或数字开头'
    if (!form.name.trim()) e.name = '必填'
    if (!/^[\w.-]+\/[\w.-]+$/.test(form.repo)) e.repo = 'owner/name 形式'
    if (form.type === 'bundle' ? !BUNDLE_SPEC_RE.test(form.spec) : !PACK_SPEC_RE.test(form.spec)) {
      e.spec = form.type === 'bundle' ? 'github:owner/repo#tag、git+https://…#tag 或 npm 包名' : 'https:// 开头的 zip 下载地址'
    }
    if (!form.description.trim()) e.description = '必填'
    if (!form.license.trim()) e.license = '必填'
    if (!form.authorName.trim()) e.authorName = '必填'
    if (form.authorUrl && !/^https:\/\//.test(form.authorUrl)) e.authorUrl = '以 https:// 开头'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const prUrl = () => {
    const filename = 'registry/curated/' + (form.id || 'plugin') + '.json'
    const value = JSON.stringify(entry, null, 2)
    return PR_FILE_BASE + '?filename=' + encodeURIComponent(filename) + '&value=' + encodeURIComponent(value)
  }

  const doCopy = async () => {
    if (await copyText(JSON.stringify(entry, null, 2))) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
  }

  const openPR = () => { if (validate()) window.open(prUrl(), '_blank', 'noopener') }

  return (
    <div className="shell">
      <div className="page-head">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />返回目录</button>
        <h1>上传插件</h1>
      </div>
      <p className="page-sub">
        填好表单后点击「发起 PR」，会把条目 JSON 直接带到 GitHub 的新建文件页面。提交后自动跑 schema 校验，合并即上架。
        详细规范见仓库 docs/SUBMIT.md。
      </p>
      <div className="submit-grid">
        <form onSubmit={(e) => { e.preventDefault(); openPR() }}>
          <div className="field">
            <label>插件类型</label>
            <div className="radio-row">
              <label className={'radio' + (form.type === 'bundle' ? ' on' : '')}>
                <input type="radio" name="type" checked={form.type === 'bundle'} onChange={() => setType('bundle')} />
                <Plug size={15} />DSH 插件（bundle，走 dsh plugin add）
              </label>
              <label className={'radio' + (form.type === 'pack' ? ' on' : '')}>
                <input type="radio" name="type" checked={form.type === 'pack'} onChange={() => setType('pack')} />
                <Package size={15} />扩展包（skill / preset zip）
              </label>
            </div>
          </div>
          <div className="field">
            <label>id <span className="req">*</span></label>
            <input value={form.id} onChange={set('id')} placeholder="stock-combo-analyzer" />
            <div className="hint">全局唯一标识，用于目录与卸载记录。</div>
            {errors.id && <div className="err">{errors.id}</div>}
          </div>
          <div className="field">
            <label>名称 <span className="req">*</span></label>
            <input value={form.name} onChange={set('name')} placeholder="股票组合分析" />
            {errors.name && <div className="err">{errors.name}</div>}
          </div>
          <div className="field">
            <label>仓库 <span className="req">*</span></label>
            <input value={form.repo} onChange={set('repo')} placeholder="losebird/dsh-plugin-stock" />
            <div className="hint">插件代码所在的 GitHub 仓库。</div>
            {errors.repo && <div className="err">{errors.repo}</div>}
          </div>
          <div className="field">
            <label>安装源 spec <span className="req">*</span></label>
            <input value={form.spec} onChange={set('spec')} placeholder={form.type === 'bundle' ? 'github:losebird/dsh-plugin-stock#v0.1.5' : 'https://github.com/owner/repo/releases/download/tag/pkg.zip'} />
            <div className="hint">{form.type === 'bundle' ? '带 tag 的 github: 形式最稳，tag 即版本。' : 'GitHub Release 里 zip 资产的下载地址。'}</div>
            {errors.spec && <div className="err">{errors.spec}</div>}
          </div>
          {form.type === 'bundle' && (
            <div className="field">
              <label>npm 包名</label>
              <input value={form.package} onChange={set('package')} placeholder="dsh-plugin-stock" />
              <div className="hint">卸载时按包名执行 dsh plugin remove，有就填。</div>
            </div>
          )}
          <div className="field">
            <label>版本</label>
            <input value={form.version} onChange={set('version')} placeholder="v0.1.5" />
          </div>
          <div className="field">
            <label>一句话简介 <span className="req">*</span></label>
            <input value={form.description} onChange={set('description')} placeholder="基于三维一体模型的 A 股量化分析工具" />
            {errors.description && <div className="err">{errors.description}</div>}
          </div>
          <div className="field">
            <label>完整介绍</label>
            <textarea value={form.longDescription} onChange={set('longDescription')} placeholder="支持 markdown 的详细介绍，显示在详情弹窗" />
          </div>
          <div className="field">
            <label>标签</label>
            <input value={form.tags} onChange={set('tags')} placeholder="stock, analysis" />
            <div className="hint">逗号分隔，最多 8 个。</div>
          </div>
          <div className="field">
            <label>许可 <span className="req">*</span></label>
            <input value={form.license} onChange={set('license')} placeholder="MIT" />
            {errors.license && <div className="err">{errors.license}</div>}
          </div>
          <div className="field">
            <label>作者名 <span className="req">*</span></label>
            <input value={form.authorName} onChange={set('authorName')} placeholder="losebird" />
            {errors.authorName && <div className="err">{errors.authorName}</div>}
          </div>
          <div className="field">
            <label>作者主页</label>
            <input value={form.authorUrl} onChange={set('authorUrl')} placeholder="https://github.com/losebird" />
            {errors.authorUrl && <div className="err">{errors.authorUrl}</div>}
          </div>
          {form.type === 'pack' && (
            <>
              <div className="field">
                <label>包含的 skill 目录</label>
                <input value={form.skills} onChange={set('skills')} placeholder="stock-combo-analyzer" />
                <div className="hint">逗号分隔，对应 zip 内 skills/&lt;id&gt;/ 目录。</div>
              </div>
              <div className="field">
                <label>包含的 preset 目录</label>
                <input value={form.presets} onChange={set('presets')} placeholder="stock-analyst" />
                <div className="hint">逗号分隔，对应 zip 内 presets/&lt;id&gt;/ 目录。</div>
              </div>
            </>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary"><GithubLogo size={16} />发起 PR</button>
            <button type="button" className="btn btn-ghost" onClick={doCopy}>{copied ? '已复制' : '复制条目 JSON'}</button>
          </div>
        </form>

        <div className="preview-panel">
          <div className="preview-box">
            <div className="bar"><span>registry/curated/{(form.id || 'plugin')}.json</span><span>预览</span></div>
            <pre>{JSON.stringify(entry, null, 2)}</pre>
          </div>
          <div className="check-list">
            <h4>发起 PR 前请确认</h4>
            {form.type === 'bundle' ? (
              <>
                <li><CheckCircle size={15} /> 插件仓库已推送到 GitHub</li>
                <li><CheckCircle size={15} /> 已发布一个 Release，tag 与 spec 一致</li>
                <li><CheckCircle size={15} /> 构建产物已提交进仓库（不依赖安装时 prepare 编译）</li>
                <li><CheckCircle size={15} /> package.json 声明了 dsh.bundle 或 dsh.client</li>
              </>
            ) : (
              <>
                <li><CheckCircle size={15} /> 扩展包按规范组织：manifest.json + skills/ + presets/</li>
                <li><CheckCircle size={15} /> 已打成 zip 并上传为 GitHub Release 资产</li>
                <li><CheckCircle size={15} /> spec 是资产的实际下载地址</li>
              </>
            )}
            <li><CheckCircle size={15} /> 已登录 GitHub，点击发起 PR 后在新页面提交</li>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 根组件 ───────────────────────────────────────── */
export default function App() {
  const [view, setView] = useState('home')
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let alive = true
    loadRegistry()
      .then((list) => { if (alive) { setItems(list); setStatus('ready') } })
      .catch(() => { if (alive) { setItems(DEMO_ITEMS); setStatus('demo') } })
    return () => { alive = false }
  }, [])

  const goSubmit = () => setView('submit')
  const goHome = () => setView('home')

  return (
    <>
      <nav className="nav">
        <div className="nav-inner shell">
          <a className="brand" href="#top" onClick={goHome}>
            <span className="brand-mark"><Plug size={16} weight="bold" /></span>
            DSH 插件市场
          </a>
          <div className="nav-links">
            <button className="nav-link" onClick={() => { goHome(); setTimeout(() => document.getElementById('directory') && document.getElementById('directory').scrollIntoView(), 0) }}>目录</button>
            <button className="nav-link" onClick={() => { goHome(); setTimeout(() => document.getElementById('how') && document.getElementById('how').scrollIntoView(), 0) }}>工作原理</button>
            <a className="nav-link" href={'https://github.com/' + GITHUB_REPO} target="_blank" rel="noreferrer"><GithubLogo size={15} />仓库</a>
            <button className="nav-link nav-cta" onClick={goSubmit}><UploadSimple size={15} />上传插件</button>
          </div>
        </div>
      </nav>
      <main id="top">
        {view === 'home' ? (
          <Home items={items} status={status} onGoSubmit={goSubmit} onOpenDetail={setDetail} />
        ) : (
          <SubmitPage onBack={goHome} />
        )}
      </main>
      <footer>
        <div className="footer-inner shell">
          <span>数据源 github.com/{GITHUB_REPO}，每日自动采集，全部可审计</span>
          <span>安装请在 DSH 应用内「插件市场」弹窗中完成</span>
        </div>
      </footer>
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
