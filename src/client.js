// dsh-plugin-market 浏览器半片：设置 → 插件 → 插件市场（AMD bundle，由 client-modules 提供）
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
        title: '插件市场', viewMarket: '市场', viewManage: '已安装',
        openMarket: '打开插件市场', openHint: '浏览、安装与管理你的 DSH 插件',
        tabVerified: '可一键安装', tabUnverified: '未验证',
        tabFeatured: '精选插件', tabNew: '最新发布', tabHandmade: '大神手作',
        search: '搜索插件…', refresh: '刷新', refreshing: '刷新中…', all: '全部',
        install: '安装', update: '更新', uninstall: '卸载', remove: '删除',
        installing: '安装中…', uninstalling: '卸载中…', installed: '已安装', latestPill: '已是最新',
        copyUrl: '复制地址', copied: '已复制', copyCmd: '复制命令',
        auto: '自动收录', unver: '未验证', demo: '演示', offline: '已下线',
        offlineNote: '仓库已下线，无法安装', unverNote: '未验证（缺 dsh.bundle 声明），无法一键安装',
        typeBundle: 'DSH 插件', typePack: '扩展包', downloads: '下载量', stars: '星标',
        loading: '加载中…', empty: '没有匹配的插件',
        sourceRemote: 'registry 实时', sourceDemo: '演示数据',
        pagerPrev: '上一页', pagerNext: '下一页', page: '第 {p}/{total} 页',
        detailBtn: '详情', back: '返回', readmeLoading: '加载项目说明中…', readmeError: '项目说明加载失败',
        repoBtn: '查看仓库', latest: '最新',
        msgInstalled: '安装完成', msgRestart: '重启 dsh 后生效', msgUninstalled: '已卸载',
        msgUseBundle: '重启后在本页「已安装」或 DSH 设置 → 插件中可见该插件。',
        msgUsePack: 'skill 在新会话可用；preset 在新会话的预设列表中选择后生效。',
        errOp: '操作失败', langBtn: 'EN',
        mSearch: '搜索已安装…', mEmpty: '还没有通过插件市场或 dsh plugin add 安装的插件。',
        enable: '启用', disable: '禁用', enabledLabel: '已启用', disabledLabel: '已禁用',
        failedLabel: '加载失败', sourceMarket: '市场安装', sourceManual: '手动安装', elsewherePill: '在其他 profile',
        installGuide: '安装说明', manualNote: '该插件按其仓库说明安装，请参考下方 README。', migrate: '迁移到 web',
        restartNote: '禁用/启用/删除在重启 dsh 后生效。',
        officialInstall: '官方安装方式（来自项目 README）',
        scriptNote: '一键安装将执行当前系统对应的官方脚本。',
        cloneNote: '克隆仓库后按其 README 步骤构建，市场不代为执行。',
        installNow: '一键安装', currentOs: '当前系统',
      },
      en: {
        title: 'Plugin Market', viewMarket: 'Market', viewManage: 'Installed',
        openMarket: 'Open Plugin Market', openHint: 'Browse, install and manage your DSH plugins',
        tabVerified: 'One-click install', tabUnverified: 'Unverified',
        tabFeatured: 'Featured', tabNew: 'New', tabHandmade: 'By Makers',
        search: 'Search plugins…', refresh: 'Refresh', refreshing: 'Refreshing…', all: 'All',
        install: 'Install', update: 'Update', uninstall: 'Uninstall', remove: 'Remove',
        installing: 'Installing…', uninstalling: 'Uninstalling…', installed: 'Installed', latestPill: 'Up to date',
        copyUrl: 'Copy URL', copied: 'Copied', copyCmd: 'Copy command',
        auto: 'Auto', unver: 'Unverified', demo: 'Demo', offline: 'Offline',
        offlineNote: 'Repo offline, cannot install', unverNote: 'Unverified (missing dsh.bundle), one-click install unavailable',
        typeBundle: 'DSH plugin', typePack: 'Pack', downloads: 'Downloads', stars: 'Stars',
        loading: 'Loading…', empty: 'No matching plugins',
        sourceRemote: 'registry live', sourceDemo: 'demo data',
        pagerPrev: 'Prev', pagerNext: 'Next', page: 'Page {p}/{total}',
        detailBtn: 'Details', back: 'Back', readmeLoading: 'Loading README…', readmeError: 'Failed to load README',
        repoBtn: 'View repo', latest: 'latest',
        msgInstalled: 'Installed', msgRestart: 'Restart DSH to take effect', msgUninstalled: 'Uninstalled',
        msgUseBundle: 'After restart, find it here under Installed or in DSH Settings → Plugins.',
        msgUsePack: 'Skills are available in new sessions; presets must be selected in a new session\'s preset list.',
        errOp: 'Operation failed', langBtn: '中文',
        mSearch: 'Search installed…', mEmpty: 'No plugins installed via the market or dsh plugin add yet.',
        enable: 'Enable', disable: 'Disable', enabledLabel: 'Enabled', disabledLabel: 'Disabled',
        failedLabel: 'Failed', sourceMarket: 'Market', sourceManual: 'Manual', elsewherePill: 'In another profile',
        installGuide: 'Install guide', manualNote: 'This plugin installs per its repo instructions; see the README below.', migrate: 'Migrate to web',
        restartNote: 'Disable / enable / remove take effect after restarting dsh.',
        officialInstall: 'Official install (from the project README)',
        scriptNote: 'One-click install runs the official script for your current OS.',
        cloneNote: 'Clone the repo and follow its README steps; the market does not run it for you.',
        installNow: 'Install now', currentOs: 'current OS',
      },
    }

    const PAGE_SIZE = 12
    const BORDER = 'var(--dsw-alias-border-l2)'

    const CSS = `
.dshm-root { display:flex; flex-direction:column; gap:8px; font-size:13px; color:var(--dsw-alias-label-primary); width:100%; max-width:none; }
.dshm-launch { display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding:16px 18px; border:1px solid ${BORDER}; border-radius:14px; background:var(--dsw-alias-bg-base); cursor:pointer; width:100%; text-align:left; }
.dshm-launch:hover { border-color:var(--dsw-alias-brand-primary); }
.dshm-launch-title { display:inline-flex; align-items:center; gap:8px; font-size:14px; font-weight:650; color:var(--dsw-alias-brand-primary); }
.dshm-launch-hint { font-size:12.5px; color:var(--dsw-alias-label-secondary); }
.dshm-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:auto; z-index:200; }
.dshm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.5); }
.dshm-panel { position:relative; display:flex; flex-direction:column; width:min(1100px, 96vw); height:min(760px, 92vh); background:var(--dsw-alias-bg-layer-1); border:1px solid ${BORDER}; border-radius:16px; box-shadow:0 24px 64px rgba(0,0,0,0.4); overflow:hidden; }
.dshm-head { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid ${BORDER}; }
.dshm-title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dshm-head-badges { flex:1; display:flex; gap:6px; }
.dshm-close { margin-left:auto; border:none; background:transparent; color:var(--dsw-alias-label-secondary); font-size:20px; cursor:pointer; line-height:1; padding:2px 6px; border-radius:6px; }
.dshm-close:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-2); }
.dshm-body { flex:1; overflow-y:auto; padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px; }
.dshm-viewseg { display:flex; gap:10px; }
.dshm-viewbtn { display:inline-flex; align-items:center; gap:6px; border:1px solid ${BORDER}; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:13px; font-weight:500; padding:6px 16px; border-radius:10px; cursor:pointer; }
.dshm-viewbtn:hover { color:var(--dsw-alias-label-primary); }
.dshm-viewbtn.on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; font-weight:600; }
.dshm-toolbar { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; }
.dshm-searchwrap { position:relative; min-width:0; }
.dshm-search { width:100%; box-sizing:border-box; padding:8px 30px 8px 12px; border:1px solid ${BORDER}; border-radius:10px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:14px; }
.dshm-search:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.dshm-searchclear { position:absolute; right:7px; top:50%; transform:translateY(-50%); border:none; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:16px; line-height:1; padding:2px 5px; border-radius:6px; }
.dshm-searchclear:hover { color:var(--dsw-alias-label-primary); }
.dshm-strip { padding:8px 12px; border-radius:8px; font-size:12px; }
.dshm-strip-ok { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-success-primary); }
.dshm-strip-err { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-error-primary); }
.dshm-seg { display:flex; gap:10px; flex-wrap:wrap; }
.dshm-seg-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid ${BORDER}; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12.5px; font-weight:500; padding:5px 14px; border-radius:10px; cursor:pointer; }
.dshm-seg-btn:hover { color:var(--dsw-alias-label-primary); }
.dshm-seg-btn.on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; font-weight:600; }
.dshm-cats { display:flex; gap:6px; flex-wrap:wrap; }
.dshm-chip { border:1px solid ${BORDER}; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; padding:3px 11px; border-radius:999px; cursor:pointer; }
.dshm-chip:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-brand-primary); }
.dshm-chip.on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.dshm-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; align-content:start; }
.dshm-card { display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid ${BORDER}; border-radius:12px; background:var(--dsw-alias-bg-base); transition:border-color 120ms ease, transform 120ms ease; }
.dshm-card:hover { border-color:var(--dsw-alias-border-l2); transform:translateY(-2px); }
.dshm-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.dshm-card-name { font-size:17px; font-weight:700; letter-spacing:-0.01em; line-height:1.3; color:var(--dsw-alias-brand-primary); }
.dshm-card-badges { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
.dshm-pill { font-size:11px; padding:2px 7px; border-radius:999px; border:1px solid ${BORDER}; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.dshm-pill-auto { color:var(--dsw-alias-state-warn-primary); border-color:currentColor; }
.dshm-pill-on { color:var(--dsw-alias-state-success-primary); border-color:currentColor; }
.dshm-pill-demo { color:var(--dsw-alias-brand-primary); border-color:currentColor; }
.dshm-pill-off { color:var(--dsw-alias-state-error-primary); border-color:currentColor; }
.dshm-pill-unver { color:var(--dsw-alias-state-warn-primary); border-color:currentColor; }
.dshm-pill-warn { color:var(--dsw-alias-state-warn-primary); border-color:currentColor; }
.dshm-pill-cat { color:var(--dsw-alias-brand-primary); border-color:currentColor; }
.dshm-card-author { font-size:12.5px; color:var(--dsw-alias-label-secondary); }
.dshm-card-author a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
.dshm-card-desc { font-size:13px; color:var(--dsw-alias-label-secondary); line-height:1.55; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; flex:1; }
.dshm-card-tags { display:flex; gap:6px; flex-wrap:wrap; }
.dshm-tag { font-size:11px; padding:1px 8px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.dshm-card-stats { display:flex; gap:14px; font-size:12.5px; color:var(--dsw-alias-label-secondary); }
.dshm-card-stats span { display:inline-flex; align-items:center; gap:5px; }
.dshm-stat-type { margin-left:auto; }
.dshm-card-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dshm-btn { display:inline-flex; align-items:center; gap:6px; flex:none; white-space:nowrap; padding:7px 16px; border-radius:12px; border:none; background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); font:inherit; font-size:14px; font-weight:500; cursor:pointer; text-decoration:none; }
.dshm-btn:hover { background:var(--dsw-alias-button-floating-hover); }
.dshm-btn-primary { background:var(--dsw-alias-brand-primary); color:#fff; }
.dshm-btn-primary:hover { opacity:0.92; }
.dshm-btn-warn { background:transparent; color:var(--dsw-alias-state-warn-primary); border:1px solid var(--dsw-alias-state-warn-primary); }
.dshm-btn-warn:hover { background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
.dshm-btn-success { background:transparent; color:var(--dsw-alias-state-success-primary); border:1px solid var(--dsw-alias-state-success-primary); }
.dshm-btn-success:hover { background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.dshm-btn-danger { background:transparent; color:var(--dsw-alias-state-error-primary); }
.dshm-btn-danger:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-state-error-primary); }
.dshm-btn-ghost { background:transparent; color:var(--dsw-alias-label-secondary); }
.dshm-btn-ghost:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.dshm-btn-outline { background:transparent; border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); border-radius:10px; }
.dshm-btn-outline:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-label-secondary); }
.dshm-btn:disabled { opacity:0.5; cursor:not-allowed; }
.dshm-btn-sm { padding:6px 14px; font-size:13px; border-radius:10px; }
.dshm-busy { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-empty { padding:32px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:13px; }
.dshm-pager { display:flex; align-items:center; justify-content:center; gap:14px; padding:10px 0 4px; }
.dshm-pager-info { font-size:12px; color:var(--dsw-alias-label-secondary); }
.dshm-detail { display:flex; flex-direction:column; gap:12px; }
.dshm-detail-head { display:flex; align-items:center; gap:10px; }
.dshm-backbtn { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; border-radius:10px; border:none; background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); font-size:14px; font-weight:500; cursor:pointer; }
.dshm-backbtn:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.dshm-detail-name { font-size:15px; font-weight:650; color:var(--dsw-alias-label-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshm-detail-meta { display:flex; gap:14px; flex-wrap:wrap; font-size:12.5px; color:var(--dsw-alias-label-secondary); }
.dshm-readme-title { font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary); letter-spacing:0.04em; margin-top:6px; }
.dshm-installpanel { display:flex; flex-direction:column; gap:8px; padding:12px 14px; border:1px solid ${BORDER}; border-radius:12px; background:var(--dsw-alias-bg-base); margin-top:4px; }
.dshm-install-title { font-size:12.5px; font-weight:650; color:var(--dsw-alias-brand-primary); }
.dshm-ostabs { display:flex; gap:6px; flex-wrap:wrap; }
.dshm-cmd { display:block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.6; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); padding:8px 10px; border-radius:8px; overflow-wrap:anywhere; white-space:pre-wrap; }
.dshm-install-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dshm-readme { color:var(--dsw-alias-label-secondary); font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
.dshm-readme h1, .dshm-readme h2, .dshm-readme h3, .dshm-readme h4 { color:var(--dsw-alias-label-primary); font-size:14.5px; margin:12px 0 6px; }
.dshm-readme p { margin:6px 0; }
.dshm-readme ul, .dshm-readme ol { padding-left:20px; margin:6px 0; }
.dshm-readme code { font-family:monospace; font-size:12px; background:var(--dsw-alias-bg-layer-2); padding:1px 5px; border-radius:5px; color:var(--dsw-alias-brand-primary); }
.dshm-readme pre { background:var(--dsw-alias-bg-layer-2); padding:10px 12px; border-radius:8px; overflow-x:auto; }
.dshm-readme pre code { background:none; padding:0; color:var(--dsw-alias-label-secondary); }
.dshm-readme img { max-width:100%; border-radius:8px; }
.dshm-readme a { color:var(--dsw-alias-brand-primary); }
.dshm-readme table { border-collapse:collapse; }
.dshm-readme td, .dshm-readme th { border:1px solid ${BORDER}; padding:4px 8px; font-size:12px; }
.dshm-manage-row { display:flex; align-items:center; gap:10px; padding:12px 14px; border:1px solid ${BORDER}; border-radius:12px; background:var(--dsw-alias-bg-base); flex-wrap:wrap; }
.dshm-manage-name { font-size:13.5px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dshm-manage-actions { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
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
        items: [], installed: {}, busy: {}, copiedRepo: null, detail: null, readme: null,
        q: '', cat: null, group: 'verified', page: 0, lang: savedLang,
        view: 'market', mRows: [], mQ: '', mCat: null, mLoading: false,
        notice: null, error: null, loading: false, source: 'demo', open: false,
        os: 'darwin', osTab: null,
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
      const osLabel = (os) => ({ darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[os] || String(os))
      const osKeysOf = (inst) => ['darwin', 'linux', 'win32'].filter((k) => inst && inst.os && inst.os[k])
      const installCmdFor = (item, os) => {
        const inst = item.install || {}
        if (inst.method === 'script' && inst.os) {
          return inst.os[os] || (os !== 'win32' ? (inst.os.darwin || inst.os.linux) : null) || inst.os.win32 || ''
        }
        if (inst.method === 'npm-global' || inst.method === 'command' || inst.method === 'git-clone') return inst.command || ''
        return 'dsh plugin --profile web add ' + item.spec
      }
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
            os: (res && res.os) || 'darwin',
            loading: false,
          })
        } catch (e) {
          patch({ loading: false, error: String(e && e.message ? e.message : e) })
        }
      }

      const loadInstalled = async () => {
        patch({ mLoading: true })
        try {
          const res = await api('installed')
          patch({ mRows: (res && Array.isArray(res.rows)) ? res.rows : [], mLoading: false })
        } catch (e) {
          patch({ mLoading: false, error: String(e && e.message ? e.message : e) })
        }
      }

      const runInstall = async (item) => {
        patch({ busy: Object.assign({}, store.busy, { [item.id]: 'install' }), error: null, notice: null })
        try {
          const res = await api('install', { id: item.id, type: item.type, spec: item.spec, package: item.package || null, install: item.install || null })
          const ok = res && res.ok
          patch({
            busy: Object.assign({}, store.busy, { [item.id]: null }),
            notice: ok
              ? t('msgInstalled') + '，' + t('msgRestart') + '。' + (item.type === 'bundle' ? t('msgUseBundle') : t('msgUsePack'))
              : null,
            error: ok ? null : ((res && res.error) || t('errOp')),
          })
          if (ok) { await refresh(); await loadInstalled() }
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
            notice: ok ? t('msgUninstalled') + '，' + t('msgRestart') : null,
            error: ok ? null : ((res && res.error) || t('errOp')),
          })
          if (ok) { await refresh(); await loadInstalled() }
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
      const doCopyCmd = (item) => {
        const cmd = installCmdFor(item, store.os)
        try {
          navigator.clipboard.writeText(cmd).then(() => {
            patch({ copiedRepo: item.id + ':cmd' })
            setTimeout(() => patch({ copiedRepo: null }), 1600)
          }).catch(() => {})
        } catch {}
      }
      const copyTextCmd = (text, key) => {
        try {
          navigator.clipboard.writeText(text).then(() => {
            patch({ copiedRepo: key })
            setTimeout(() => patch({ copiedRepo: null }), 1600)
          }).catch(() => {})
        } catch {}
      }

      const openDetail = (item) => {
        patch({ detail: item, readme: null })
        if (item.repo) {
          api('readme?repo=' + encodeURIComponent(item.repo)).then((res) => {
            if (res && res.ok && typeof res.html === 'string') patch({ readme: res.html })
            else patch({ readme: 'error' })
          }).catch(() => patch({ readme: 'error' }))
        } else {
          patch({ readme: 'none' })
        }
      }
      const closeDetail = () => patch({ detail: null, readme: null })

      const doToggle = async (row) => {
        const res = await api('toggle', { name: row.name, enabled: !row.enabled })
        const ok = res && res.ok
        patch({ notice: ok ? (res.message || t('restartNote')) : null, error: ok ? null : ((res && res.error) || t('errOp')) })
        if (ok) await loadInstalled()
      }
      const doRemove = async (row) => {
        const res = await api('remove', { name: row.name })
        const ok = res && res.ok
        patch({ notice: ok ? (res.message || t('msgUninstalled')) : null, error: ok ? null : ((res && res.error) || t('errOp')) })
        if (ok) { await loadInstalled(); await refresh() }
      }

      const fmtNum = (n) => {
        if (typeof n !== 'number') return '0'
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm'
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
        return String(n)
      }

      function Card(item, st) {
        const installedRaw = st.installed && st.installed[item.id]
        const installed = installedRaw && installedRaw.source !== 'other' ? installedRaw : null
        const busy = st.busy && st.busy[item.id]
        const unavailable = item.status === 'unavailable'
        const upToDate = !!installed && item.type === 'bundle' && installed.spec === item.spec
        return h('div', { className: 'dshm-card', key: item.id },
          h('div', { className: 'dshm-card-top' },
            h('div', { className: 'dshm-card-name' }, shortName(item.name)),
            h('div', { className: 'dshm-card-badges' },
              h('span', { className: 'dshm-pill dshm-pill-cat' }, catLabel(item)),
              h('span', { className: 'dshm-pill' }, item.version || t('latest')),
              item.auto ? h('span', { className: 'dshm-pill dshm-pill-auto' }, t('auto')) : null,
              item.demo ? h('span', { className: 'dshm-pill dshm-pill-demo' }, t('demo')) : null,
              item.verified === false ? h('span', { className: 'dshm-pill dshm-pill-unver' }, t('unver')) : null,
              unavailable ? h('span', { className: 'dshm-pill dshm-pill-off' }, t('offline')) : null,
              installedRaw && installedRaw.source === 'other'
                ? h('span', { className: 'dshm-pill dshm-pill-warn' }, t('elsewherePill') + (installedRaw.profile ? ' ' + installedRaw.profile : ''))
                : null,
              upToDate ? h('span', { className: 'dshm-pill dshm-pill-on' }, t('latestPill')) : null,
              installed && !upToDate ? h('span', { className: 'dshm-pill dshm-pill-on' }, t('installed')) : null,
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
            h('span', { title: t('downloads') },
              h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M8 2v7.5M4.5 7L8 10.5 11.5 7M2.5 13.5h11' })),
              fmtNum(item.downloads)),
            h('span', { title: t('stars') },
              h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' },
                h('path', { d: 'M8 1.8l2 4.2 4.6.6-3.4 3.2.9 4.5L8 12.1l-4.1 2.2.9-4.5L1.4 6.6l4.6-.6z' })),
              fmtNum(item.stars)),
            item.version ? h('span', null, item.version) : null,
            h('span', { className: 'dshm-stat-type' }, item.type === 'bundle' ? t('typeBundle') : t('typePack')),
          ),
          h('div', { className: 'dshm-card-actions' },
            h('button', { className: 'dshm-btn dshm-btn-outline dshm-btn-sm', onClick: () => openDetail(item) }, t('detailBtn')),
            busy
              ? h('span', { className: 'dshm-busy' }, busy === 'uninstall' ? t('uninstalling') : t('installing'))
              : unavailable
                ? h('span', { className: 'dshm-busy' }, t('offlineNote'))
                : item.verified === false
                  ? h('span', { className: 'dshm-busy' }, t('unverNote'))
                  : item.install && (item.install.method === 'manual' || item.install.method === 'desktop' || item.install.method === 'git-clone')
                    ? h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => openDetail(item) }, t('installGuide'))
                    : installedRaw && installedRaw.source === 'other'
                      ? h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) }, t('migrate'))
                      : installed && !upToDate
                    ? h('span', null,
                        h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) }, t('update')),
                        h('button', { className: 'dshm-btn dshm-btn-outline dshm-btn-sm', onClick: () => runUninstall(item) }, t('uninstall')))
                    : installed && upToDate
                      ? h('button', { className: 'dshm-btn dshm-btn-outline dshm-btn-sm', onClick: () => runUninstall(item) }, t('uninstall'))
                      : h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) }, t('install'))),
          item.verified === false && item.repo
            ? h('button', { className: 'dshm-btn dshm-btn-ghost dshm-btn-sm', onClick: () => copyRepo(item), title: 'https://github.com/' + item.repo },
                st.copiedRepo === item.id ? t('copied') : t('copyUrl'))
            : null,
        )
      }

      function InstallPanel(st, item) {
        const inst = item.install || {}
        const installedRaw = st.installed && st.installed[item.id]
        const installed = installedRaw && installedRaw.source !== 'other' ? installedRaw : null
        const upToDate = !!installed && item.type === 'bundle' && installed.spec === item.spec
        const copyBtn = (cmd, key) => h('button', { className: 'dshm-btn dshm-btn-ghost dshm-btn-sm', onClick: () => copyTextCmd(cmd, key) },
          st.copiedRepo === key ? t('copied') : t('copyCmd'))
        const installBtn = (enabled) => (enabled && !upToDate)
          ? h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) },
              (installed ? t('update') : t('installNow')) + ' · ' + osLabel(store.os))
          : null
        if (inst.method === 'script' && inst.os) {
          const oses = osKeysOf(inst)
          const sel = oses.includes(st.osTab) ? st.osTab : (oses.includes(store.os) ? store.os : oses[0])
          return h('div', { className: 'dshm-installpanel' },
            h('div', { className: 'dshm-install-title' }, t('officialInstall')),
            h('div', { className: 'dshm-ostabs' },
              oses.map((k) => h('button', {
                key: k,
                className: 'dshm-seg-btn' + (k === sel ? ' on' : ''),
                onClick: () => patch({ osTab: k }),
              }, osLabel(k) + (k === store.os ? ' · ' + t('currentOs') : '')))),
            h('code', { className: 'dshm-cmd' }, inst.os[sel]),
            h('div', { className: 'dshm-install-actions' },
              copyBtn(inst.os[sel], item.id + ':os:' + sel),
              installBtn(item.verified !== false)),
            h('div', { className: 'dshm-card-desc' }, t('scriptNote')),
          )
        }
        if (inst.method === 'npm-global' || inst.method === 'command') {
          const cmd = inst.command || ''
          return h('div', { className: 'dshm-installpanel' },
            h('code', { className: 'dshm-cmd' }, cmd),
            h('div', { className: 'dshm-install-actions' },
              copyBtn(cmd, item.id + ':os:npm'),
              installBtn(item.verified !== false)),
          )
        }
        if (inst.method === 'git-clone') {
          const cmd = inst.command || ''
          return h('div', { className: 'dshm-installpanel' },
            h('code', { className: 'dshm-cmd' }, cmd),
            h('div', { className: 'dshm-install-actions' }, copyBtn(cmd, item.id + ':os:clone')),
            h('div', { className: 'dshm-card-desc' }, t('cloneNote')),
          )
        }
        return null
      }

      function DetailView(st) {
        const item = st.detail
        const installedRaw = st.installed && st.installed[item.id]
        const installed = installedRaw && installedRaw.source !== 'other' ? installedRaw : null
        const upToDate = !!installed && item.type === 'bundle' && installed.spec === item.spec
        return h('div', { className: 'dshm-detail' },
          h('div', { className: 'dshm-detail-head' },
            h('button', { className: 'dshm-backbtn', onClick: closeDetail }, '← ' + t('back')),
            h('div', { className: 'dshm-detail-name' }, shortName(item.name)),
            h('span', { className: 'dshm-stat-type' }, item.type === 'bundle' ? t('typeBundle') : t('typePack')),
          ),
          h('div', { className: 'dshm-detail-meta' },
            h('span', null, (item.author && item.author.name) || 'Unknown'),
            h('span', null, item.version || t('latest')),
            h('span', null, catLabel(item)),
            h('span', null, item.license || 'UNKNOWN'),
            h('span', null, '★ ' + fmtNum(item.stars)),
            (item.downloads || 0) > 0 ? h('span', null, '⬇ ' + fmtNum(item.downloads)) : null,
          ),
          h('div', { className: 'dshm-card-desc' }, item.description || ''),
          (item.tags && item.tags.length > 0)
            ? h('div', { className: 'dshm-card-tags' }, item.tags.map((tg) => h('span', { className: 'dshm-tag', key: tg }, tg)))
            : null,
          h('div', { className: 'dshm-card-actions' },
            item.verified !== false && !upToDate
              && !(item.install && (item.install.method === 'manual' || item.install.method === 'desktop' || item.install.method === 'git-clone'
                || ((item.install.method === 'script' && item.install.os) || item.install.method === 'npm-global' || item.install.method === 'command')))
              ? h('button', { className: 'dshm-btn dshm-btn-primary', onClick: () => runInstall(item) },
                  installed ? t('update') : t('install'))
              : null,
            item.type === 'bundle' && item.verified !== false
              ? h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => doCopyCmd(item) },
                  st.copiedRepo === item.id + ':cmd' ? t('copied') : t('copyCmd'))
              : null,
            installed
              ? h('button', { className: 'dshm-btn dshm-btn-outline dshm-btn-sm', onClick: () => runUninstall(item) }, t('uninstall'))
              : null,
            item.verified === false
              ? h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => copyRepo(item) },
                  st.copiedRepo === item.id ? t('copied') : t('copyUrl'))
              : null,
            h('a', { className: 'dshm-btn dshm-btn-ghost', href: 'https://github.com/' + item.repo, target: '_blank', rel: 'noreferrer' }, t('repoBtn')),
          ),
          item.verified === false
            ? h('div', { className: 'dshm-strip dshm-strip-err' }, t('unverNote'))
            : null,
          item.install && (item.install.method === 'manual' || item.install.method === 'desktop')
            ? h('div', { className: 'dshm-strip dshm-strip-ok' }, t('manualNote'))
            : null,
          InstallPanel(st, item),
          h('div', { className: 'dshm-readme-title' }, 'README'),
          st.readme === null
            ? h('div', { className: 'dshm-empty' }, t('readmeLoading'))
            : st.readme === 'error'
              ? h('div', { className: 'dshm-empty' }, t('readmeError'))
              : st.readme === 'none'
                ? null
                : h('div', { className: 'dshm-readme', dangerouslySetInnerHTML: { __html: st.readme } }),
        )
      }

      function ManageView(st) {
        const qv = (st.mQ || '').trim().toLowerCase()
        const counts = new Map()
        for (const row of st.mRows) {
          const item = st.items.find((it) => it.package === row.name)
          const c = (item && item.category) || 'other'
          counts.set(c, (counts.get(c) || 0) + 1)
        }
        const cats = [...counts.entries()].sort((a, b) => b[1] - a[1])
        const rows = st.mRows.filter((row) => {
          const item = st.items.find((it) => it.package === row.name)
          if (st.mCat && ((item && item.category) || 'other') !== st.mCat) return false
          if (!qv) return true
          const hay = [row.name, row.id].join(' ').toLowerCase()
          return hay.indexOf(qv) !== -1
        })
        return h('div', { className: 'dshm-detail' },
          h('div', { className: 'dshm-toolbar' },
            h('div', { className: 'dshm-searchwrap' },
              h('input', { className: 'dshm-search', placeholder: t('mSearch'), value: st.mQ || '', onChange: (e) => patch({ mQ: e.target.value }) }),
              (st.mQ && st.mQ.length > 0)
                ? h('button', { className: 'dshm-searchclear', title: 'clear', onClick: () => patch({ mQ: '' }) }, '×')
                : null,
            ),
          ),
          cats.length > 0
            ? h('div', { className: 'dshm-cats' },
                h('button', { className: 'dshm-chip' + (st.mCat === null ? ' on' : ''), onClick: () => patch({ mCat: null }) }, t('all')),
                cats.map(([c, n]) => h('button', {
                  className: 'dshm-chip' + (st.mCat === c ? ' on' : ''),
                  key: c,
                  onClick: () => patch({ mCat: st.mCat === c ? null : c }),
                }, (CATEGORIES[c] || CATEGORIES.other)[store.lang] + ' ' + n)),
              )
            : null,
          h('div', { className: 'dshm-strip dshm-strip-ok' }, t('restartNote')),
          st.mLoading
            ? h('div', { className: 'dshm-empty' }, t('loading'))
            : rows.length === 0
              ? h('div', { className: 'dshm-empty' }, t('mEmpty'))
              : h('div', { className: 'dshm-detail' },
                  rows.map((row) => {
                    const item = st.items.find((it) => it.package === row.name)
                    const installed = item && st.installed[item.id]
                    const upToDate = installed && item.type === 'bundle' && installed.spec === item.spec
                    const isOther = row.source === 'other'
                    return h('div', { className: 'dshm-manage-row', key: row.id || row.name },
                      h('div', { className: 'dshm-manage-name' }, shortName(row.name)),
                      h('span', { className: 'dshm-pill' }, row.name),
                      h('span', { className: 'dshm-pill ' + (isOther ? 'dshm-pill-warn' : (row.enabled ? 'dshm-pill-on' : 'dshm-pill-warn')) }, isOther ? (t('elsewherePill') + (row.profile ? ' ' + row.profile : '')) : (row.enabled ? t('enabledLabel') : t('disabledLabel'))),
                      row.failed ? h('span', { className: 'dshm-pill dshm-pill-off' }, t('failedLabel')) : null,
                      h('span', { className: 'dshm-pill ' + (row.source === 'market' ? 'dshm-pill-on' : '') }, row.source === 'market' ? t('sourceMarket') : t('sourceManual')),
                      h('div', { className: 'dshm-manage-actions' },
                        isOther
                          ? (item
                              ? h('button', { className: 'dshm-btn dshm-btn-primary dshm-btn-sm', onClick: () => runInstall(item) }, t('migrate'))
                              : null)
                          : [
                              h('button', { className: 'dshm-btn ' + (row.enabled ? 'dshm-btn-warn' : 'dshm-btn-success') + ' dshm-btn-sm', onClick: () => doToggle(row) }, row.enabled ? t('disable') : t('enable')),
                              item && installed && !upToDate
                                ? h('button', { className: 'dshm-btn dshm-btn-primary dshm-btn-sm', onClick: () => runInstall(item) }, t('update'))
                                : null,
                              h('button', { className: 'dshm-btn dshm-btn-danger dshm-btn-sm', onClick: () => doRemove(row) }, t('remove')),
                            ],
                      ),
                    )
                  }),
                ),
        )
      }

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'market', order: 17, label: () => (store.lang === 'zh' ? '插件市场' : 'Plugin Market') },
        (props) => {
          const st = useStore()
          useEffect(() => {
            if (props && typeof props.close === 'function') props.close()
            patch({ open: true, detail: null })
            if (st.items.length === 0 && !st.loading) refresh()
          }, [])
          return h('div', { className: 'dshm-root' },
            h('button', {
              className: 'dshm-launch',
              onClick: () => {
                if (props && typeof props.close === 'function') props.close()
                patch({ open: true, detail: null })
                if (st.items.length === 0 && !st.loading) refresh()
              },
            },
              h('span', { className: 'dshm-launch-title' },
                h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
                  h('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3 }),
                  h('path', { d: 'M5.5 8h5M8 5.5v5', strokeLinecap: 'round' }),
                ),
                t('openMarket')),
              h('span', { className: 'dshm-launch-hint' }, t('openHint')),
            ),
          )
        },
      ))

      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'plugin-market-window', order: 0 },
        () => {
          const st = useStore()
          if (!st.open) return null
          const qv = (st.q || '').trim().toLowerCase()
          let base = st.items
          if (st.group === 'featured') {
            base = [...st.items].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 100)
          } else if (st.group === 'new') {
            base = st.items.filter((it) => it.releasedAt).sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt))).slice(0, 200)
          } else if (st.group === 'handmade') {
            base = st.items.filter((it) => it.source === 'curated').sort((a, b) => (b.stars || 0) - (a.stars || 0))
          } else {
            base = st.items.filter((it) => (st.group === 'unverified' ? it.verified === false : it.verified !== false))
          }
          const catCounts = new Map()
          for (const it of base) {
            const c = it.category || 'other'
            catCounts.set(c, (catCounts.get(c) || 0) + 1)
          }
          const cats = [...catCounts.entries()].sort((a, b) => b[1] - a[1])
          const filtered = base.filter((it) => {
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
          const fCount = Math.min(100, st.items.length)
          const nCount = st.items.filter((it) => it.releasedAt).length
          const hCount = st.items.filter((it) => it.source === 'curated').length

          const body = st.detail
            ? DetailView(st)
            : h('div', { className: 'dshm-root' },
                h('div', { className: 'dshm-viewseg' },
                  h('button', { className: 'dshm-viewbtn' + (st.view === 'market' ? ' on' : ''), onClick: () => patch({ view: 'market', detail: null }) }, t('viewMarket') + ' ' + st.items.length),
                  h('button', {
                    className: 'dshm-viewbtn' + (st.view === 'manage' ? ' on' : ''),
                    onClick: () => { patch({ view: 'manage' }); loadInstalled() },
                  }, t('viewManage') + ' ' + st.mRows.length),
                ),
                (st.error || st.notice)
                  ? h('div', { className: 'dshm-strip ' + (st.error ? 'dshm-strip-err' : 'dshm-strip-ok') }, st.error || st.notice)
                  : null,
                st.view === 'manage'
                  ? ManageView(st)
                  : [
                      h('div', { className: 'dshm-toolbar' },
                        h('div', { className: 'dshm-searchwrap' },
                          h('input', { className: 'dshm-search', placeholder: t('search'), value: st.q || '', onChange: (e) => patch({ q: e.target.value, page: 0 }) }),
                          (st.q && st.q.length > 0)
                            ? h('button', { className: 'dshm-searchclear', title: 'clear', onClick: () => patch({ q: '', page: 0 }) }, '×')
                            : null,
                        ),
                        h('button', { className: 'dshm-btn dshm-btn-ghost', onClick: () => refresh() }, st.loading ? t('refreshing') : t('refresh')),
                      ),
                      h('div', { className: 'dshm-seg' },
                        h('button', { className: 'dshm-seg-btn' + (st.group === 'verified' ? ' on' : ''), onClick: () => patch({ group: 'verified', cat: null, page: 0 }) }, t('tabVerified') + ' ' + vCount),
                        h('button', { className: 'dshm-seg-btn' + (st.group === 'unverified' ? ' on' : ''), onClick: () => patch({ group: 'unverified', cat: null, page: 0 }) }, t('tabUnverified') + ' ' + uCount),
                        h('button', { className: 'dshm-seg-btn' + (st.group === 'featured' ? ' on' : ''), onClick: () => patch({ group: 'featured', cat: null, page: 0 }) }, t('tabFeatured') + ' ' + fCount),
                        h('button', { className: 'dshm-seg-btn' + (st.group === 'new' ? ' on' : ''), onClick: () => patch({ group: 'new', cat: null, page: 0 }) }, t('tabNew') + ' ' + nCount),
                        h('button', { className: 'dshm-seg-btn' + (st.group === 'handmade' ? ' on' : ''), onClick: () => patch({ group: 'handmade', cat: null, page: 0 }) }, t('tabHandmade') + ' ' + hCount),
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
                    ],
              )

          return h('div', { className: 'dshm-overlay', role: 'dialog' },
            h('div', { className: 'dshm-backdrop', onClick: () => patch({ open: false, detail: null }) }),
            h('div', { className: 'dshm-panel' },
              h('div', { className: 'dshm-head' },
                h('div', { className: 'dshm-title' }, t('title')),
                h('div', { className: 'dshm-head-badges' },
                  h('span', { className: 'dshm-pill' }, st.source === 'remote' ? t('sourceRemote') : t('sourceDemo')),
                ),
                h('button', { className: 'dshm-viewbtn', title: 'switch language', onClick: toggleLang }, t('langBtn')),
                h('button', { className: 'dshm-close', title: 'close', onClick: () => patch({ open: false, detail: null }) }, '×'),
              ),
              h('div', { className: 'dshm-body' }, body),
            ),
          )
        },
      ))
    }

    return { apply }
  },
})
