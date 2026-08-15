// dsh-plugin-market 浏览器半片：侧栏按钮 + 卡片弹窗（AMD bundle，由 client-modules 提供）
window.__ModuleLoader__.load({
  id: 'dsh-plugin-market',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect } = React
    const h = React.createElement

    const CATEGORIES = {
      ui: '界面与主题', session: '会话与记忆', agent: 'Agent 与工作流', tools: '工具与集成',
      dev: '开发与输入', comm: '通信与移动', auth: '安全与权限', skills: '技能与扩展',
      market: '市场与发现', fun: '趣味与个性', other: '其他',
    }
    const catLabel = (item) => (item && item.category && CATEGORIES[item.category]) || CATEGORIES.other

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
.dshm-toolbar { display:flex; gap:8px; padding:10px 18px; }
.dshm-search { flex:1; padding:7px 10px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:13px; }
.dshm-search:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.dshm-strip { margin:0 18px 10px; padding:8px 12px; border-radius:8px; font-size:12px; }
.dshm-strip-ok { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-success-primary); }
.dshm-strip-err { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-error-primary); }
.dshm-grid { flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; padding:4px 18px 18px; align-content:start; }
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
.dshm-btn:disabled { opacity:0.5; cursor:not-allowed; }
.dshm-busy { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-warn { font-size:11.5px; line-height:1.5; color:var(--dsw-alias-state-warn-primary); border:1px dashed currentColor; border-radius:8px; padding:8px 10px; }
.dshm-installed-note { font-size:11px; color:var(--dsw-alias-label-secondary); word-break:break-all; }
.dshm-empty { padding:40px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:13px; flex:1; }
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
      const res = await fetch('/api/market/' + method, body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : undefined)
      return res.json()
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      const store = {
        open: false, loading: false, source: 'demo', notice: null, error: null,
        q: '', cat: null, items: [], installed: {}, busy: {}, confirm: null,
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
        patch({ busy: Object.assign({}, store.busy, { [item.id]: 'install' }), confirm: null, error: null, notice: null })
        try {
          const res = await api('install', { id: item.id, type: item.type, spec: item.spec, package: item.package || null })
          const ok = res && res.ok
          patch({
            busy: Object.assign({}, store.busy, { [item.id]: null }),
            notice: ok ? (res.message || '完成') : null,
            error: ok ? null : ((res && res.error) || '操作失败'),
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
            notice: ok ? (res.message || '已卸载') : null,
            error: ok ? null : ((res && res.error) || '卸载失败'),
          })
          if (ok) await refresh()
        } catch (e) {
          patch({ busy: Object.assign({}, store.busy, { [item.id]: null }), error: String(e && e.message ? e.message : e) })
        }
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
        const confirming = st.confirm === item.id
        const unavailable = item.status === 'unavailable'
        return h('div', { className: 'dshm-card', key: item.id },
          h('div', { className: 'dshm-card-top' },
            h('div', { className: 'dshm-card-name' }, item.name),
            h('div', { className: 'dshm-card-badges' },
              h('span', { className: 'dshm-pill dshm-pill-cat' }, catLabel(item)),
              item.version ? h('span', { className: 'dshm-pill' }, item.version) : null,
              item.auto ? h('span', { className: 'dshm-pill dshm-pill-auto' }, '自动收录') : null,
              item.demo ? h('span', { className: 'dshm-pill dshm-pill-demo' }, '演示') : null,
              item.verified === false ? h('span', { className: 'dshm-pill dshm-pill-unver' }, '未验证') : null,
              unavailable ? h('span', { className: 'dshm-pill dshm-pill-off' }, '已下线') : null,
              installed ? h('span', { className: 'dshm-pill dshm-pill-on' }, '已安装') : null,
            ),
          ),
          h('div', { className: 'dshm-card-author' },
            item.author ? (item.author.url
              ? h('a', { href: item.author.url, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() }, item.author.name)
              : h('span', null, item.author.name)) : '匿名作者'),
          h('div', { className: 'dshm-card-desc' }, item.description || ''),
          (item.tags && item.tags.length > 0)
            ? h('div', { className: 'dshm-card-tags' }, item.tags.map((t) => h('span', { className: 'dshm-tag', key: t }, t)))
            : null,
          h('div', { className: 'dshm-card-stats' },
            h('span', { title: '下载量' }, '⬇ ' + fmtNum(item.downloads)),
            h('span', { title: 'GitHub 星标' }, '★ ' + fmtNum(item.stars)),
            h('span', { className: 'dshm-stat-type' }, item.type === 'bundle' ? 'DSH 插件' : '扩展包'),
          ),
          h('div', { className: 'dshm-card-actions' },
            busy
              ? h('span', { className: 'dshm-busy' }, busy === 'uninstall' ? '卸载中…' : '安装中…')
              : unavailable
                ? h('span', { className: 'dshm-busy' }, '仓库已下线，无法安装')
                : item.verified === false
                  ? h('span', { className: 'dshm-busy' }, '未验证（缺 dsh.bundle 声明），无法一键安装')
                  : installed
                  ? h('span', null,
                      h('button', { className: 'dshm-btn', onClick: () => { patch({ confirm: null }); runInstall(item) } }, '更新'),
                      h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => runUninstall(item) }, '卸载'))
                  : confirming
                    ? h('span', null,
                        h('button', { className: 'dshm-btn dshm-btn-danger', onClick: () => runInstall(item) }, '确认安装'),
                        h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => patch({ confirm: null }) }, '取消'))
                    : h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => patch({ confirm: item.id }) }, '安装')),
          confirming
            ? h('div', { className: 'dshm-warn' },
                '社区插件未经官方审核，安装即信任并运行其代码。' + (item.type === 'bundle' ? ' 将执行: dsh plugin --profile web add ' + item.spec : ' 将下载并写入本地 skill/preset 目录。'))
            : null,
          installed ? h('div', { className: 'dshm-installed-note' }, '本地记录: ' + (installed.spec || installed.at || '')) : null,
        )
      }

      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'plugin-market', order: 5, label: () => '插件市场' },
        (props) => {
          const st = useStore()
          const wide = !!(props && props.wide)
          return h('button', { className: 'dshm-action', title: '插件市场', onClick: () => { patch({ open: true, confirm: null }); if (st.items.length === 0 && !st.loading) refresh() } },
            h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
              h('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3 }),
              h('path', { d: 'M5.5 8h5M8 5.5v5', strokeLinecap: 'round' }),
            ),
            wide ? h('span', { className: 'dshm-action-label' }, '插件市场') : h('span', { className: 'dshm-action-label dshm-rail' }, '插件市场'),
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
            const c = it.category || 'other'
            catCounts.set(c, (catCounts.get(c) || 0) + 1)
          }
          const cats = [...catCounts.entries()].sort((a, b) => b[1] - a[1])
          const items = st.items.filter((it) => {
            if (st.cat && (it.category || 'other') !== st.cat) return false
            if (!qv) return true
            const hay = [it.name, it.description, (it.tags || []).join(' '), it.id].join(' ').toLowerCase()
            return hay.indexOf(qv) !== -1
          })
          return h('div', { className: 'dshm-overlay', role: 'dialog' },
            h('div', { className: 'dshm-backdrop', onClick: () => patch({ open: false, confirm: null }) }),
            h('div', { className: 'dshm-panel' },
              h('div', { className: 'dshm-head' },
                h('div', { className: 'dshm-title' }, '插件市场'),
                h('div', { className: 'dshm-head-badges' },
                  h('span', { className: 'dshm-pill' }, st.source === 'remote' ? 'registry 实时' : '演示数据'),
                ),
                h('button', { className: 'dshm-close', title: '关闭', onClick: () => patch({ open: false, confirm: null }) }, '×'),
              ),
              h('div', { className: 'dshm-toolbar' },
                h('input', { className: 'dshm-search', placeholder: '搜索插件…', value: st.q || '', onChange: (e) => patch({ q: e.target.value }) }),
                h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => refresh() }, st.loading ? '刷新中…' : '刷新'),
              ),
              cats.length > 0
                ? h('div', { className: 'dshm-cats' },
                    h('button', { className: 'dshm-chip' + (st.cat === null ? ' on' : ''), onClick: () => patch({ cat: null }) }, '全部'),
                    cats.map(([c, n]) => h('button', {
                      className: 'dshm-chip' + (st.cat === c ? ' on' : ''),
                      key: c,
                      onClick: () => patch({ cat: st.cat === c ? null : c }),
                    }, (CATEGORIES[c] || c) + ' ' + n)),
                  )
                : null,
              (st.error || st.notice)
                ? h('div', { className: 'dshm-strip ' + (st.error ? 'dshm-strip-err' : 'dshm-strip-ok') }, st.error || st.notice)
                : null,
              st.loading
                ? h('div', { className: 'dshm-empty' }, '加载中…')
                : items.length === 0
                  ? h('div', { className: 'dshm-empty' }, '没有匹配的插件')
                  : h('div', { className: 'dshm-grid' }, items.map((it) => Card(it, st))),
              h('div', { className: 'dshm-foot' },
                h('span', null, '数据源: ' + (st.source === 'remote' ? 'github.com/losebird/dsh-plugin-market' : '本地演示数据')),
                h('a', { href: 'https://losebird.github.io/dsh-plugin-market/', target: '_blank', rel: 'noreferrer' }, '打开市场网站 ↗'),
              ),
            ),
          )
        },
      ))
    }

    exports.apply = apply
    return module.exports
  },
})
