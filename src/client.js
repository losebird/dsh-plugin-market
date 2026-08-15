// dsh-plugin-market 浏览器半片：侧栏按钮 + 卡片弹窗（AMD bundle，由 client-modules 提供）
window.__ModuleLoader__.load({
  id: 'dsh-plugin-market',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect } = React
    const h = React.createElement

    const CATEGORIES = {
      ui: { zh: '界面与主题', en: 'UI & Themes' },
      session: { zh: '会话与记忆', en: 'Sessions & Memory' },
      agent: { zh: 'Agent 与工作流', en: 'Agents & Workflows' },
      tools: { zh: '工具与集成', en: 'Tools & Integrations' },
      dev: { zh: '开发与输入', en: 'Dev & Input' },
      comm: { zh: '通信与移动', en: 'Comm & Mobile' },
      auth: { zh: '安全与权限', en: 'Security & Permissions' },
      skills: { zh: '技能与扩展', en: 'Skills & Packs' },
      market: { zh: '市场与发现', en: 'Market & Discovery' },
      fun: { zh: '趣味与个性', en: 'Fun & Personality' },
      other: { zh: '其他', en: 'Other' },
    }

    const I18N = {
      zh: {
        title: '插件市场', tabVerified: '可一键安装', tabUnverified: '未验证',
        search: '搜索插件…', refresh: '刷新', refreshing: '刷新中…', all: '全部',
        install: '安装', update: '更新', uninstall: '卸载',
        installing: '安装中…', uninstalling: '卸载中…', installed: '已安装',
        copyUrl: '复制地址', copied: '已复制',
        auto: '自动收录', unver: '未验证', demo: '演示', offline: '已下线',
        offlineNote: '仓库已下线，无法安装', unverNote: '未验证（缺 dsh.bundle 声明），无法一键安装',
        typeBundle: 'DSH 插件', typePack: '扩展包', downloads: '下载量', stars: '星标',
        loading: '加载中…', empty: '没有匹配的插件',
        sourceRemote: 'registry 实时', sourceDemo: '演示数据',
        footSrc: '数据源: ', footSite: '打开市场网站 ↗',
        pagerPrev: '上一页', pagerNext: '下一页', page: '第 {p}/{total} 页',
        msgInstalled: '安装完成', msgRestart: '重启 DSH 后生效', msgUninstalled: '已卸载',
        errOp: '操作失败', langBtn: 'EN', sourceLabel: '插件市场',
      },
      en: {
        title: 'Plugin Market', tabVerified: 'One-click install', tabUnverified: 'Unverified',
        search: 'Search plugins…', refresh: 'Refresh', refreshing: 'Refreshing…', all: 'All',
        install: 'Install', update: 'Update', uninstall: 'Uninstall',
        installing: 'Installing…', uninstalling: 'Uninstalling…', installed: 'Installed',
        copyUrl: 'Copy URL', copied: 'Copied',
        auto: 'Auto', unver: 'Unverified', demo: 'Demo', offline: 'Offline',
        offlineNote: 'Repo offline, cannot install', unverNote: 'Unverified (missing dsh.bundle), one-click install unavailable',
        typeBundle: 'DSH plugin', typePack: 'Pack', downloads: 'Downloads', stars: 'Stars',
        loading: 'Loading…', empty: 'No matching plugins',
        sourceRemote: 'registry live', sourceDemo: 'demo data',
        footSrc: 'Source: ', footSite: 'Open market site ↗',
        pagerPrev: 'Prev', pagerNext: 'Next', page: 'Page {p}/{total}',
        msgInstalled: 'Installed', msgRestart: 'Restart DSH to take effect', msgUninstalled: 'Uninstalled',
        errOp: 'Operation failed', langBtn: '中文', sourceLabel: 'Plugin Market',
      },
    }

    const PAGE_SIZE = 12

    // 样式注入（与官方 css-module 产物相同的 data-plugin-css 去重模式）
    const CSS = `
.dshm-action { display:flex; align-items:center; gap:8px; width:100%; padding:6px 10px; border:none; border-radius:8px; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:13px; }
.dshm-action:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.dshm-action-label { white-space:nowrap; }
.dshm-rail { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
.dshm-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:auto; z-index:200; }
.dshm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.45); }
.dshm-panel { position:relative; display:flex; flex-direction:column; width:min(920px, calc(100vw - 48px)); height:min(680px, calc(100vh - 96px)); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; box-shadow:0 24px 64px rgba(0,0,0,0.4); overflow:hidden; }
.dshm-head { display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.dshm-title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dshm-head-badges { flex:1; display:flex; gap:6px; }
.dshm-close { margin-left:auto; border:none; background:transparent; color:var(--dsw-alias-label-secondary); font-size:20px; cursor:pointer; line-height:1; }
.dshm-close:hover { color:var(--dsw-alias-label-primary); }
.dshm-lang { border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); border-radius:8px; font:inherit; font-size:12px; padding:3px 9px; cursor:pointer; }
.dshm-lang:hover { color:var(--dsw-alias-label-primary); }
.dshm-toolbar { display:flex; gap:8px; padding:10px 18px; }
.dshm-search { flex:1; padding:7px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:13px; }
.dshm-search:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.dshm-strip { margin:0 18px 10px; padding:8px 12px; border-radius:8px; font-size:12px; }
.dshm-strip-ok { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-success-primary); }
.dshm-strip-err { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-error-primary); }
.dshm-grid { flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; padding:4px 18px 12px; align-content:start; }
.dshm-card { display:flex; flex-direction:column; gap:8px; padding:14px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-base); }
.dshm-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.dshm-card-name { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dshm-card-badges { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
.dshm-pill { font-size:11px; padding:2px 7px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.dshm-pill-auto { color:var(--dsw-alias-state-warn-primary); border-color:currentColor; }
.dshm-pill-on { color:var(--dsw-alias-state-success-primary); border-color:currentColor; }
.dshm-pill-demo { color:var(--dsw-alias-brand-primary); border-color:currentColor; }
.dshm-pill-off { color:var(--dsw-alias-state-error-primary); border-color:currentColor; }
.dshm-pill-unver { color:var(--dsw-alias-state-warn-primary); border-color:currentColor; }
.dshm-pill-cat { color:var(--dsw-alias-brand-primary); border-color:currentColor; }
.dshm-cats { display:flex; gap:6px; flex-wrap:wrap; padding:0 18px 10px; }
.dshm-chip { border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; padding:3px 11px; border-radius:999px; cursor:pointer; }
.dshm-chip:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }
.dshm-chip.on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.dshm-seg { display:flex; gap:10px; padding:0 18px 10px; }
.dshm-seg-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12.5px; font-weight:550; padding:5px 14px; border-radius:8px; cursor:pointer; }
.dshm-seg-btn:hover { color:var(--dsw-alias-label-primary); }
.dshm-seg-btn.on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.dshm-card-author { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-card-author a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
.dshm-card-desc { font-size:12.5px; color:var(--dsw-alias-label-secondary); line-height:1.5; flex:1; }
.dshm-card-tags { display:flex; gap:6px; flex-wrap:wrap; }
.dshm-tag { font-size:11px; padding:1px 8px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.dshm-card-stats { display:flex; gap:12px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-stat-type { margin-left:auto; }
.dshm-card-actions { display:flex; gap:8px; align-items:center; }
.dshm-btn { padding:6px 14px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-primary); font-size:12.5px; cursor:pointer; }
.dshm-btn:hover { border-color:var(--dsw-alias-border-l2); }
.dshm-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.dshm-btn-primary:hover { opacity:0.9; }
.dshm-btn-danger { background:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); color:#fff; }
.dshm-btn-danger:hover { opacity:0.9; }
.dshm-btn-ghost { color:var(--dsw-alias-label-secondary); }
.dshm-btn-copyurl { background:transparent; color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-primary); }
.dshm-btn-copyurl:hover { background:rgba(251,191,36,0.1); border-color:var(--dsw-alias-state-warn-primary); color:var(--dsw-alias-state-warn-primary); }
.dshm-btn:disabled { opacity:0.5; cursor:not-allowed; }
.dshm-btn-sm { padding:4px 12px; font-size:12px; }
.dshm-busy { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-installed-note { font-size:11px; color:var(--dsw-alias-label-secondary); word-break:break-all; }
.dshm-empty { padding:40px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:13px; flex:1; }
.dshm-pager { display:flex; align-items:center; justify-content:center; gap:14px; padding:10px 18px 14px; }
.dshm-pager-info { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-foot { display:flex; justify-content:space-between; gap:10px; padding:10px 18px; border-top:1px solid var(--dsw-alias-border-l1); font-size:11.5px; color:var(--dsw-alias-label-secondary); }
.dshm-foot a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
`
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-plugin-market"]') === null) {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', 'dsh-plugin-market')
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    async function api(method, body) {
      const res = await fetch('/plugin-market/' + method, body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : undefined)
      return res.json()
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      let savedLang = 'zh'
      try { savedLang = localStorage.getItem('dsh-market-lang') || 'zh' } catch {}

      const store = {
        open: false, loading: false, source: 'demo', notice: null, error: null,
        q: '', cat: null, group: 'verified', page: 0, lang: savedLang,
        items: [], installed: {}, busy: {}, copiedRepo: null,
      }
      const subs = new Set()
      const patch = (p) => { Object.assign(store, p); for (const f of subs) f() }
      function useStore() {
        const [, setTick] = useState(0)
        useEffect(() => {
          const f = () => setTick((t) => t + 1)
          subs.add(f)
          return () => { subs.delete(f) }
        }, [])
        return store
      }
      const t = (key, vars) => {
        let s = (I18N[store.lang] || I18N.zh)[key] || key
        if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]))
        return s
      }
      const catLabel = (item) => (CATEGORIES[item.category] || CATEGORIES.other)[store.lang]
      const shortName = (n) => String(n || '').split('/').pop() || String(n || '')
      const toggleLang = () => {
        const next = store.lang === 'zh' ? 'en' : 'zh'
        patch({ lang: next })
        try { localStorage.setItem('dsh-market-lang', next) } catch {}
      }

      const refresh = async () => {
        patch({ loading: true, error: null })
        try {
          const res = await api('list')
          patch({
            items: res && Array.isArray(res.items) ? res.items : [],
            installed: (res && res.installed && typeof res.installed === 'object') ? res.installed : {},
            source: (res && res.source) || 'demo',
            notice: (res && res.notice) || null,
            loading: false,
          })
        } catch (e) {
          patch({ loading: false, error: String(e && e.message ? e.message : e) })
        }
      }

      const runInstall = async (item) => {
        patch({ busy: Object.assign({}, store.busy, { [item.id]: 'install' }), error: null, notice: null })
        try {
          const res = await api('install', { id: item.id, type: item.type, spec: item.spec, package: item.package || null })
          const ok = res && res.ok
          patch({
            busy: Object.assign({}, store.busy, { [item.id]: null }),
            notice: ok ? t('msgInstalled') + (item.type === 'bundle' ? '，' + t('msgRestart') : '') : null,
            error: ok ? null : ((res && res.error) || t('errOp')),
          })
          if (ok) await refresh()
        } catch (e) {
          patch({ busy: Object.assign({}, store.busy, { [item.id]: null }), error: String(e && e.message ? e.message : e) })
        }
      }

      const runUninstall = async (item) => {
        patch({ busy: Object.assign({}, store.busy, { [item.id]: 'uninstall' }), error: null, notice: null })
        try {
          const res = await api('uninstall', { id: item.id, type: item.type, package: item.package || null })
          const ok = res && res.ok
          patch({
            busy: Object.assign({}, store.busy, { [item.id]: null }),
            notice: ok ? t('msgUninstalled') : null,
            error: ok ? null : ((res && res.error) || t('errOp')),
          })
          if (ok) await refresh()
        } catch (e) {
          patch({ busy: Object.assign({}, store.busy, { [item.id]: null }), error: String(e && e.message ? e.message : e) })
        }
      }

      const copyRepo = (item) => {
        const url = 'https://github.com/' + item.repo
        try {
          navigator.clipboard.writeText(url).then(() => {
            patch({ copiedRepo: item.id })
            setTimeout(() => patch({ copiedRepo: null }), 1600)
          }).catch(() => {})
        } catch {}
      }

      const fmtNum = (n) => {
        if (typeof n !== 'number') return '0'
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm'
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
        return String(n)
      }

      function Card(item, st) {
        const installed = st.installed && st.installed[item.id]
        const busy = st.busy && st.busy[item.id]
        const unavailable = item.status === 'unavailable'
        return h('div', { className: 'dshm-card', key: item.id },
          h('div', { className: 'dshm-card-top' },
            h('div', { className: 'dshm-card-name' }, shortName(item.name)),
            h('div', { className: 'dshm-card-badges' },
              h('span', { className: 'dshm-pill dshm-pill-cat' }, catLabel(item)),
              item.version ? h('span', { className: 'dshm-pill' }, item.version) : null,
              item.auto ? h('span', { className: 'dshm-pill dshm-pill-auto' }, t('auto')) : null,
              item.demo ? h('span', { className: 'dshm-pill dshm-pill-demo' }, t('demo')) : null,
              item.verified === false ? h('span', { className: 'dshm-pill dshm-pill-unver' }, t('unver')) : null,
              unavailable ? h('span', { className: 'dshm-pill dshm-pill-off' }, t('offline')) : null,
              installed ? h('span', { className: 'dshm-pill dshm-pill-on' }, t('installed')) : null,
            ),
          ),
          h('div', { className: 'dshm-card-author' },
            item.author ? (item.author.url
              ? h('a', { href: item.author.url, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, item.author.name)
              : h('span', null, item.author.name)) : 'Unknown'),
          h('div', { className: 'dshm-card-desc' }, item.description || ''),
          (item.tags && item.tags.length > 0)
            ? h('div', { className: 'dshm-card-tags' }, item.tags.map((tg) => h('span', { className: 'dshm-tag', key: tg }, tg)))
            : null,
          h('div', { className: 'dshm-card-stats' },
            h('span', { title: t('stars') }, '★ ' + fmtNum(item.stars)),
            (item.downloads || 0) > 0 ? h('span', { title: t('downloads') }, '⬇ ' + fmtNum(item.downloads)) : null,
            h('span', { className: 'dshm-stat-type' }, item.type === 'bundle' ? t('typeBundle') : t('typePack')),
          ),
          h('div', { className: 'dshm-card-actions' },
            busy
              ? h('span', { className: 'dshm-busy' }, busy === 'uninstall' ? t('uninstalling') : t('installing'))
              : unavailable
                ? h('span', { className: 'dshm-busy' }, t('offlineNote'))
                : item.verified === false
                  ? h('span', null,
                      h('span', { className: 'dshm-busy' }, t('unverNote')),
                      h('button', { className: 'dshm-btn dshm-btn-primary dshm-btn-sm', onClick: () => copyRepo(item), title: 'https://github.com/' + item.repo },
                        st.copiedRepo === item.id ? t('copied') : t('copyUrl')),
                    )
                  : installed
                    ? h('span', null,
                        h('button', { className: 'dshm-btn', onClick: () => runInstall(item) }, t('update')),
                        h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => runUninstall(item) }, t('uninstall')))
                    : h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) }, t('install'))),
          installed ? h('div', { className: 'dshm-installed-note' }, 'local: ' + (installed.spec || installed.at || '')) : null,
        )
      }

      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'plugin-market', order: 5, label: () => (store.lang === 'zh' ? '插件市场' : 'Plugin Market') },
        (props) => {
          const st = useStore()
          const wide = !!(props && props.wide)
          return h('button', { className: 'dshm-action', title: t('title'), onClick: () => { patch({ open: true }); if (st.items.length === 0 && !st.loading) refresh() } },
            h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
              h('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3 }),
              h('path', { d: 'M5.5 8h5M8 5.5v5', strokeLinecap: 'round' }),
            ),
            wide
              ? h('span', { className: 'dshm-action-label' }, t('title'))
              : h('span', { className: 'dshm-action-label dshm-rail' }, t('title')),
          )
        },
      ))

      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'plugin-market-overlay', order: 0 },
        () => {
          const st = useStore()
          if (!st.open) return null
          const qv = (st.q || '').trim().toLowerCase()
          const catCounts = new Map()
          for (const it of st.items) {
            if ((st.group === 'verified' && it.verified === false) || (st.group === 'unverified' && it.verified !== false)) continue
            const c = it.category || 'other'
            catCounts.set(c, (catCounts.get(c) || 0) + 1)
          }
          const cats = [...catCounts.entries()].sort((a, b) => b[1] - a[1])
          const filtered = st.items.filter((it) => {
            if (st.group === 'verified' && it.verified === false) return false
            if (st.group === 'unverified' && it.verified !== false) return false
            if (st.cat && (it.category || 'other') !== st.cat) return false
            if (!qv) return true
            const hay = [it.name, it.description, (it.tags || []).join(' '), it.id].join(' ').toLowerCase()
            return hay.indexOf(qv) !== -1
          })
          const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
          const safePage = Math.min(st.page, totalPages - 1)
          const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
          let vCount = 0
          let uCount = 0
          for (const it of st.items) { if (it.verified === false) uCount++; else vCount++ }
          return h('div', { className: 'dshm-overlay', role: 'dialog' },
            h('div', { className: 'dshm-backdrop', onClick: () => patch({ open: false }) }),
            h('div', { className: 'dshm-panel' },
              h('div', { className: 'dshm-head' },
                h('div', { className: 'dshm-title' }, t('title')),
                h('div', { className: 'dshm-head-badges' },
                  h('span', { className: 'dshm-pill' }, st.source === 'remote' ? t('sourceRemote') : t('sourceDemo')),
                ),
                h('button', { className: 'dshm-lang', title: 'switch language', onClick: toggleLang }, t('langBtn')),
                h('button', { className: 'dshm-close', title: 'close', onClick: () => patch({ open: false }) }, '×'),
              ),
              h('div', { className: 'dshm-toolbar' },
                h('input', { className: 'dshm-search', placeholder: t('search'), value: st.q || '', onChange: (e) => patch({ q: e.target.value, page: 0 }) }),
                h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => refresh() }, st.loading ? t('refreshing') : t('refresh')),
              ),
              h('div', { className: 'dshm-seg' },
                h('button', { className: 'dshm-seg-btn' + (st.group === 'verified' ? ' on' : ''), onClick: () => patch({ group: 'verified', cat: null, page: 0 }) }, t('tabVerified') + ' ' + vCount),
                h('button', { className: 'dshm-seg-btn' + (st.group === 'unverified' ? ' on' : ''), onClick: () => patch({ group: 'unverified', cat: null, page: 0 }) }, t('tabUnverified') + ' ' + uCount),
              ),
              cats.length > 0
                ? h('div', { className: 'dshm-cats' },
                    h('button', { className: 'dshm-chip' + (st.cat === null ? ' on' : ''), onClick: () => patch({ cat: null, page: 0 }) }, t('all')),
                    cats.map(([c, n]) => h('button', {
                      className: 'dshm-chip' + (st.cat === c ? ' on' : ''),
                      key: c,
                      onClick: () => patch({ cat: st.cat === c ? null : c, page: 0 }),
                    }, (CATEGORIES[c] || CATEGORIES.other)[store.lang] + ' ' + n)),
                  )
                : null,
              (st.error || st.notice)
                ? h('div', { className: 'dshm-strip ' + (st.error ? 'dshm-strip-err' : 'dshm-strip-ok') }, st.error || st.notice)
                : null,
              st.loading
                ? h('div', { className: 'dshm-empty' }, t('loading'))
                : filtered.length === 0
                  ? h('div', { className: 'dshm-empty' }, t('empty'))
                  : h('div', { className: 'dshm-grid' }, pageItems.map((it) => Card(it, st))),
              totalPages > 1
                ? h('div', { className: 'dshm-pager' },
                    h('button', { className: 'dshm-btn dshm-btn-ghost dshm-btn-sm', disabled: safePage <= 0, onClick: () => patch({ page: safePage - 1 }) }, '← ' + t('pagerPrev')),
                    h('span', { className: 'dshm-pager-info' }, t('page', { p: safePage + 1, total: totalPages })),
                    h('button', { className: 'dshm-btn dshm-btn-ghost dshm-btn-sm', disabled: safePage >= totalPages - 1, onClick: () => patch({ page: safePage + 1 }) }, t('pagerNext') + ' →'),
                  )
                : null,
              h('div', { className: 'dshm-foot' },
                h('span', null, t('footSrc') + (st.source === 'remote' ? 'github.com/losebird/dsh-plugin-market' : 'demo')),
                h('a', { href: 'https://www.dsh-plugin.shop/', target: '_blank', rel: 'noreferrer' }, t('footSite')),
              ),
            ),
          )
        },
      ))
    }

    return { apply }
  },
})
