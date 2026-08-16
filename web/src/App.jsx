import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, CaretRight, Check, CheckCircle, CircleNotch, Clock, Copy, DownloadSimple,
  GithubLogo, MagnifyingGlass, Moon, Package, Plug, Sparkle, Star, Sun, UploadSimple, UserCircle, Warning, X,
} from '@phosphor-icons/react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const GITHUB_REPO = 'losebird/dsh-plugin-market'
const INSTALL_SPEC = 'github:losebird/dsh-plugin-market#v0.1.34'
const PR_FILE_BASE = 'https://github.com/' + GITHUB_REPO + '/new/main'
const REGISTRY_BASE = import.meta.env.BASE_URL
const RAW_REGISTRY = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/registry/all.json'
const PAGE_SIZE = 24

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
    'nav.directory': '目录', 'nav.how': '工作原理', 'nav.repo': '仓库', 'nav.upload': '上传插件',
    'nav.themeLight': '切换到亮色主题', 'nav.themeDark': '切换到暗色主题',
    'hero.t1': '发现并安装', 'hero.t2': 'DSH 社区插件',
    'hero.sub': '上千个社区插件与扩展包，一键装进你的 DSH。数据来自 GitHub，每日自动采集。',
    'hero.statTotal': '个插件', 'hero.statVerified': '可一键安装', 'hero.statDaily': '数据来自 GitHub，每日自动采集',
    'hero.browse': '浏览目录', 'hero.upload': '上传插件',
    'install.title': '把插件市场装进你的 DSH',
    'install.after': '重启后，侧栏 Settings 旁常驻「插件市场」按钮',
    'install.copy': '复制安装命令', 'install.copied': '已复制',
    'toast.copied': '安装命令已复制，粘贴到终端执行即可',
    'toast.repo': '项目地址已复制',
    'copiedModal.title': '安装命令已复制',
    'copiedModal.currentMachine': '本机',
    'copiedModal.guide1': '在 DSH 内打开侧栏「插件市场」，找到该插件点一键安装（推荐）；',
    'copiedModal.guide2': '或把命令粘贴到终端直接执行（已在剪贴板）。',
    'copiedModal.gotIt': '知道了', 'copiedModal.viewDetail': '查看详情',
    'copiedModal.urlGuide1': '该插件未验证，市场不提供一键安装；',
    'copiedModal.urlGuide2': '打开详情页，把项目地址发给 DSH，让它按仓库说明帮你安装。',
    'copiedModal.stepsTitle': '安装方式（按项目 README）',
    'copiedModal.steps1': '① 在 DSH 应用内打开侧栏「插件市场」，找到该插件点「安装」；',
    'copiedModal.steps2': '② DSH 会阅读项目 README 并自动执行安装；需要你选择或确认时，会在 DSH 对话中弹窗询问；',
    'copiedModal.steps3': '③ 安装完成后按提示重启 DSH 生效。',
    'copiedModal.stepsUnverified': '该插件未验证（未声明 dsh.bundle）：DSH 会按 README 尽力安装，若无法挂载会向你说明原因。',
    'dir.title': '插件目录', 'dir.count': '{n} 个条目',
    'dir.demo': 'registry 暂不可用，当前展示演示数据。',
    'dir.search': '搜索名称、简介或标签',
    'dir.sortStars': '按星标', 'dir.sortDownloads': '按下载量', 'dir.sortName': '按名称',
    'dir.tabVerified': '可一键安装', 'dir.tabUnverified': '未验证',
    'dir.tabFeatured': '精选插件', 'dir.tabNew': '最新发布', 'dir.tabHandmade': '大神手作',
    'dir.emptyAll': '目录还是空的。上传第一个插件？', 'dir.emptyFilter': '没有匹配的插件，换个关键词试试。',
    'dir.pagerPrev': '上一页', 'dir.pagerNext': '下一页', 'dir.pager': '第 {p} / {total} 页',
    'card.detail': '详情', 'card.install': '安装', 'card.copied': '已复制', 'card.copyUrl': '复制地址',
    'card.downloads': '下载量', 'card.stars': 'GitHub 星标',
    'badge.pack': '扩展包', 'badge.auto': '自动收录', 'badge.unver': '未验证', 'badge.demo': '演示', 'badge.off': '已下线', 'badge.featured': '精选',
    'detail.author': '作者', 'detail.version': '版本', 'detail.category': '分类', 'detail.license': '许可', 'detail.downloads': '下载',
    'detail.intro': '简介', 'detail.readme': '项目说明', 'detail.readmeLoading': '加载项目说明中…',
    'detail.readmeError': '项目 README 加载失败，', 'detail.readmeLink': '去仓库查看',
    'detail.readmeDefault': '默认',
    'detail.copy': '复制', 'detail.copied': '已复制',
    'detail.bundleNote': '安装方式来自项目 README。在 DSH 应用内打开侧栏「插件市场」弹窗点安装，会自动执行当前系统的命令；安装后重启 DSH 生效。',
    'detail.packDownload': '下载扩展包 zip',
    'detail.packNote': '下载 zip 后在 DSH 插件市场弹窗中选择「从本地导入」，或手动解压到对应目录（skill 放 ~/.agents/skills/，preset 放 ~/.dsh/.agent-presets/）。',
    'detail.repo': '查看仓库', 'detail.unavailable': '该条目仓库已删除或转为私有',
    'detail.manualNote': '该插件按其仓库说明安装。在 DSH 应用内的插件市场点「交给 DSH 安装」，DSH 会阅读项目 README 自动安装，需要你选择时弹窗询问。',
    'detail.unverified': '该仓库未声明 dsh.bundle.patch，一键安装不可用（直接 dsh plugin add 只会作为普通依赖安装、不会挂载插件）。请到仓库查看作者提供的手工安装方式。',
    'how.title': '工作原理',
    'how.sub': '没有私有后端。插件数据就是仓库里的 JSON 文件，每天由 GitHub Actions 自动采集、去重、合并，网站与 DSH 弹窗读的是同一份数据。',
    'how.s1t': '作者发布', 'how.s1b': '插件作者在自己的 GitHub 仓库发 Release（bundle 包或 zip 扩展包），构建产物直接提交进仓库，不依赖安装时编译。',
    'how.s2t': 'PR 上架或自动收录', 'how.s2b': '上传页生成条目 JSON，作者向 registry/curated/ 提 PR，合并即上架；仓库打了 topic 的插件也会被每日任务自动收录。',
    'how.s3t': '每日合并去重', 'how.s3b': '采集任务汇总下载量与星标，按包名和仓库去重，curated 条目优先，输出 registry/all.json。',
    'how.s4t': 'DSH 内一键安装', 'how.s4b': '用户在 DSH 侧栏的插件市场弹窗里点安装，等价执行 dsh plugin --profile web add，重启后生效。',
    'submit.back': '返回目录', 'submit.title': '上传插件',
    'submit.sub': '填好表单后点击「发起 PR」，会把条目 JSON 直接带到 GitHub 的新建文件页面。提交后自动跑 schema 校验，合并即上架。详细规范见仓库 docs/SUBMIT.md。',
    'submit.type': '插件类型', 'submit.typeBundle': 'DSH 插件（bundle，走 dsh plugin add）', 'submit.typePack': '扩展包（skill / preset zip）',
    'submit.id': 'id', 'submit.idHint': '全局唯一标识，用于目录与卸载记录。',
    'submit.name': '名称', 'submit.repo': '仓库', 'submit.repoHint': '插件代码所在的 GitHub 仓库。',
    'submit.spec': '安装源 spec', 'submit.specBundleHint': '带 tag 的 github: 形式最稳，tag 即版本。',
    'submit.specPackHint': 'GitHub Release 里 zip 资产的下载地址。',
    'submit.package': 'npm 包名', 'submit.packageHint': '卸载时按包名执行 dsh plugin remove，有就填。',
    'submit.version': '版本', 'submit.description': '一句话简介', 'submit.longDesc': '完整介绍',
    'submit.longDescPh': '支持 markdown 的详细介绍，显示在详情弹窗',
    'submit.tags': '标签', 'submit.tagsHint': '逗号分隔，最多 8 个。',
    'submit.license': '许可', 'submit.authorName': '作者名', 'submit.authorUrl': '作者主页',
    'submit.skills': '包含的 skill 目录', 'submit.skillsHint': '逗号分隔，对应 zip 内 skills/<id>/ 目录。',
    'submit.presets': '包含的 preset 目录', 'submit.presetsHint': '逗号分隔，对应 zip 内 presets/<id>/ 目录。',
    'submit.pr': '发起 PR', 'submit.copyJson': '复制条目 JSON', 'submit.copied': '已复制',
    'submit.checkTitle': '发起 PR 前请确认',
    'submit.c1': '插件仓库已推送到 GitHub', 'submit.c2': '已发布一个 Release，tag 与 spec 一致',
    'submit.c3': '构建产物已提交进仓库（不依赖安装时 prepare 编译）', 'submit.c4': 'package.json 声明了 dsh.bundle 或 dsh.client',
    'submit.p1': '扩展包按规范组织：manifest.json + skills/ + presets/', 'submit.p2': '已打成 zip 并上传为 GitHub Release 资产',
    'submit.p3': 'spec 是资产的实际下载地址', 'submit.p4': '已登录 GitHub，点击发起 PR 后在新页面提交',
    'submit.preview': '预览',
    'err.id': '小写字母、数字、点、下划线、连字符，字母或数字开头', 'err.name': '必填',
    'err.repo': 'owner/name 形式',
    'err.specBundle': 'github:owner/repo#tag、git+https://…#tag 或 npm 包名', 'err.specPack': 'https:// 开头的 zip 下载地址',
    'err.desc': '必填', 'err.license': '必填', 'err.author': '必填', 'err.authorUrl': '以 https:// 开头',
    'footer.data': '数据源 github.com/{repo}，每日自动采集，全部可审计',
    'footer.install': '安装请在 DSH 应用内「插件市场」弹窗中完成',
    'faq.title': '常见问题',
    'faq.q1': '如何安装插件市场？', 'faq.a1a': '在终端执行 ', 'faq.a1b': '，然后重启 dsh。重启后侧栏 Settings 旁常驻「插件市场」按钮。',
    'faq.q2': '如何在 DSH 里安装插件？', 'faq.a2a': '打开插件市场弹窗，点卡片上的「安装」即可；也可以复制安装命令到终端执行 ', 'faq.a2b': '（把 spec 换成对应插件）。扩展包类插件先下载 zip，再在弹窗里导入。',
    'faq.q3': '为什么我的终端里没有 dsh 命令？', 'faq.a3a': '如果你是用 ', 'faq.a3b': ' 方式启动的，dsh 命令并没有安装到系统里。先全局安装 ', 'faq.a3c': '，之后 dsh 系列命令（dsh web、dsh plugin add 等）就都可用了。',
    'faq.q4': '为什么有些插件标着「未验证」？', 'faq.a4a': '它们的仓库没有声明 ', 'faq.a4b': '，直接 dsh plugin add 只会作为普通依赖安装、不会挂载成插件。请参考作者仓库的手工安装说明。',
    'faq.q5': '安装后插件没有生效？', 'faq.a5': 'bundle 类插件安装后需要重启 dsh 才生效；扩展包里的 skill 在新会话可用，preset 需要在新会话的预设列表中选择。',
    'faq.q6': '如何卸载插件？', 'faq.a6a': '在弹窗里点「卸载」，或在终端执行 ', 'faq.a6b': '（包名可在插件详情里查看）。',
    'faq.q7': '未验证的插件应该怎么安装呢？', 'faq.a7': '点击卡片「详情」，把项目地址发给 dsh，让它帮你安装即可。',
    'links.title': '相关资源', 'links.llm': 'AI 大模型', 'links.agent': 'Agent 平台', 'links.token': 'API 中转',
  },
  en: {
    'nav.directory': 'Directory', 'nav.how': 'How it works', 'nav.repo': 'Repo', 'nav.upload': 'Submit',
    'nav.themeLight': 'Switch to light theme', 'nav.themeDark': 'Switch to dark theme',
    'hero.t1': 'Discover & install', 'hero.t2': 'DSH community plugins',
    'hero.sub': 'Thousands of community plugins and packs, one click into your DSH. Data from GitHub, collected daily.',
    'hero.statTotal': 'plugins', 'hero.statVerified': 'one-click install', 'hero.statDaily': 'from GitHub, collected daily',
    'hero.browse': 'Browse', 'hero.upload': 'Submit plugin',
    'install.title': 'Install the market into your DSH',
    'install.after': 'After restart, a Plugin Market button stays beside Settings in the sidebar',
    'install.copy': 'Copy install command', 'install.copied': 'Copied',
    'toast.copied': 'Install command copied. Paste it in your terminal to run.',
    'toast.repo': 'Repo URL copied',
    'copiedModal.title': 'Install command copied',
    'copiedModal.currentMachine': 'this device',
    'copiedModal.guide1': 'In DSH, open the Plugin Market and click install on this plugin (recommended);',
    'copiedModal.guide2': 'or paste the command into your terminal (already on your clipboard).',
    'copiedModal.gotIt': 'Got it', 'copiedModal.viewDetail': 'View details',
    'copiedModal.urlGuide1': 'This plugin is unverified, so one-click install is unavailable;',
    'copiedModal.urlGuide2': 'Open the details and send the project URL to DSH to install it per the repo instructions.',
    'copiedModal.stepsTitle': 'Install method (from the project README)',
    'copiedModal.steps1': '1. In DSH, open the Plugin Market and click Install on this plugin;',
    'copiedModal.steps2': '2. DSH reads the project README and installs automatically; when your choice is needed, it asks you in the DSH conversation;',
    'copiedModal.steps3': '3. Restart DSH after the install as prompted.',
    'copiedModal.stepsUnverified': 'This plugin is unverified (no dsh.bundle): DSH will try its best per the README and explain if it cannot be mounted.',
    'dir.title': 'Plugin Directory', 'dir.count': '{n} entries',
    'dir.demo': 'Registry unavailable, showing demo data.',
    'dir.search': 'Search name, description or tags',
    'dir.sortStars': 'By stars', 'dir.sortDownloads': 'By downloads', 'dir.sortName': 'By name',
    'dir.tabVerified': 'One-click install', 'dir.tabUnverified': 'Unverified',
    'dir.tabFeatured': 'Featured', 'dir.tabNew': 'New', 'dir.tabHandmade': 'By Makers',
    'dir.emptyAll': 'The directory is empty. Submit the first plugin?', 'dir.emptyFilter': 'No matching plugins. Try another keyword.',
    'dir.pagerPrev': 'Prev', 'dir.pagerNext': 'Next', 'dir.pager': 'Page {p} / {total}',
    'card.detail': 'Details', 'card.install': 'Install', 'card.copied': 'Copied', 'card.copyUrl': 'Copy URL',
    'card.downloads': 'Downloads', 'card.stars': 'GitHub stars',
    'badge.pack': 'Pack', 'badge.auto': 'Auto', 'badge.unver': 'Unverified', 'badge.demo': 'Demo', 'badge.off': 'Offline', 'badge.featured': 'Featured',
    'detail.author': 'Author', 'detail.version': 'Version', 'detail.category': 'Category', 'detail.license': 'License', 'detail.downloads': 'Downloads',
    'detail.intro': 'About', 'detail.readme': 'README', 'detail.readmeLoading': 'Loading README…',
    'detail.readmeError': 'Failed to load README. ', 'detail.readmeLink': 'View on GitHub',
    'detail.readmeDefault': 'Default',
    'detail.copy': 'Copy', 'detail.copied': 'Copied',
    'detail.bundleNote': 'Install steps come from the project README. In DSH, open the Plugin Market modal and click install — it runs the command for your current OS. Restart DSH to take effect.',
    'detail.packDownload': 'Download pack zip',
    'detail.packNote': 'Download the zip, then import it from the DSH Plugin Market modal, or extract manually (skills to ~/.agents/skills/, presets to ~/.dsh/.agent-presets/).',
    'detail.repo': 'View repo', 'detail.unavailable': 'This repo has been deleted or made private',
    'detail.manualNote': 'This plugin installs per its repo instructions. In DSH, open the Plugin Market and click "Let DSH install" — DSH reads the project README and installs automatically, asking you when a choice is needed.',
    'detail.unverified': 'This repo does not declare dsh.bundle.patch, so one-click install is unavailable (dsh plugin add would only add it as a plain dependency). Check the repo for the author\'s manual install steps.',
    'how.title': 'How it works',
    'how.sub': 'No private backend. Plugin data is just JSON files in the repo, collected, deduplicated and merged by GitHub Actions daily. The website and the DSH modal read the same data.',
    'how.s1t': 'Authors publish', 'how.s1b': 'Authors cut a Release in their GitHub repo (bundle package or zip pack) and commit build artifacts instead of relying on install-time builds.',
    'how.s2t': 'PR or auto-collection', 'how.s2b': 'The submit page generates the entry JSON; authors PR it into registry/curated/. Repos tagged with the topic are also picked up by the daily job.',
    'how.s3t': 'Daily merge & dedup', 'how.s3b': 'The collector aggregates downloads and stars, dedups by package name and repo, prefers curated entries, and writes registry/all.json.',
    'how.s4t': 'One-click install in DSH', 'how.s4b': 'Users click install in the DSH sidebar modal, which runs dsh plugin --profile web add. Restart to activate.',
    'submit.back': 'Back to directory', 'submit.title': 'Submit a plugin',
    'submit.sub': 'Fill the form and click Submit PR to carry the entry JSON straight into a GitHub new-file page. Schema validation runs automatically on the PR; merge to publish. See docs/SUBMIT.md for the spec.',
    'submit.type': 'Type', 'submit.typeBundle': 'DSH plugin (bundle, via dsh plugin add)', 'submit.typePack': 'Pack (skill / preset zip)',
    'submit.id': 'id', 'submit.idHint': 'Globally unique id used for the directory and uninstall bookkeeping.',
    'submit.name': 'Name', 'submit.repo': 'Repo', 'submit.repoHint': 'The GitHub repo hosting the plugin code.',
    'submit.spec': 'Install spec', 'submit.specBundleHint': 'A tagged github: spec is the most stable; the tag is the version.',
    'submit.specPackHint': 'Download URL of the zip asset in a GitHub Release.',
    'submit.package': 'npm package name', 'submit.packageHint': 'Used for dsh plugin remove. Fill it in when you have one.',
    'submit.version': 'Version', 'submit.description': 'Short description', 'submit.longDesc': 'Full description',
    'submit.longDescPh': 'Markdown details shown in the detail modal',
    'submit.tags': 'Tags', 'submit.tagsHint': 'Comma separated, up to 8.',
    'submit.license': 'License', 'submit.authorName': 'Author name', 'submit.authorUrl': 'Author URL',
    'submit.skills': 'Skill dirs', 'submit.skillsHint': 'Comma separated, matching skills/<id>/ inside the zip.',
    'submit.presets': 'Preset dirs', 'submit.presetsHint': 'Comma separated, matching presets/<id>/ inside the zip.',
    'submit.pr': 'Submit PR', 'submit.copyJson': 'Copy entry JSON', 'submit.copied': 'Copied',
    'submit.checkTitle': 'Before submitting',
    'submit.c1': 'Plugin repo is pushed to GitHub', 'submit.c2': 'A Release exists and its tag matches spec',
    'submit.c3': 'Build artifacts are committed (no install-time prepare builds)', 'submit.c4': 'package.json declares dsh.bundle or dsh.client',
    'submit.p1': 'Pack follows the layout: manifest.json + skills/ + presets/', 'submit.p2': 'Zipped and uploaded as a GitHub Release asset',
    'submit.p3': 'spec is the real download URL of the asset', 'submit.p4': 'You are signed in to GitHub to submit the PR',
    'submit.preview': 'Preview',
    'err.id': 'Lowercase letters, digits, dots, underscores, hyphens; must start with a letter or digit', 'err.name': 'Required',
    'err.repo': 'owner/name form',
    'err.specBundle': 'github:owner/repo#tag, git+https://…#tag, or an npm package name', 'err.specPack': 'An https:// zip download URL',
    'err.desc': 'Required', 'err.license': 'Required', 'err.author': 'Required', 'err.authorUrl': 'Must start with https://',
    'footer.data': 'Data source github.com/{repo}, collected daily, fully auditable',
    'footer.install': 'Install from the Plugin Market modal inside DSH',
    'faq.title': 'FAQ',
    'faq.q1': 'How do I install the market itself?', 'faq.a1a': 'Run ', 'faq.a1b': ' in your terminal, then restart dsh. The Plugin Market button then stays beside Settings in the sidebar.',
    'faq.q2': 'How do I install a plugin?', 'faq.a2a': 'Open the market modal and click Install on a card, or copy the command and run ', 'faq.a2b': ' (replace with the plugin spec). For packs, download the zip and import it in the modal.',
    'faq.q3': 'Why is there no dsh command in my terminal?', 'faq.a3a': 'If you started dsh with ', 'faq.a3b': ', the dsh command is not installed on your system. Install it globally with ', 'faq.a3c': ', then all dsh commands (dsh web, dsh plugin add, etc.) become available.',
    'faq.q4': 'Why are some plugins marked Unverified?', 'faq.a4a': 'Their repos do not declare ', 'faq.a4b': ', so dsh plugin add would only add them as plain dependencies without mounting. Check the repo for manual install steps.',
    'faq.q5': 'Installed but not taking effect?', 'faq.a5': 'Bundle plugins require a dsh restart. Skills from packs are available in new sessions; presets must be selected in a new session\'s preset list.',
    'faq.q6': 'How do I uninstall?', 'faq.a6a': 'Click Uninstall in the modal, or run ', 'faq.a6b': ' (find the package name in the plugin detail).',
    'faq.q7': 'How do I install an Unverified plugin?', 'faq.a7': 'Open Details, send the project URL to dsh, and ask it to install for you.',
    'links.title': 'Related', 'links.llm': 'LLMs', 'links.agent': 'Agent', 'links.token': 'API Relays',
  },
}

const LangCtx = createContext(null)
const useLang = () => useContext(LangCtx)

const DEMO_ITEMS = [
  {
    id: 'dsh-plugin-market', name: 'DSH 插件市场', type: 'bundle', package: 'dsh-plugin-market',
    repo: 'losebird/dsh-plugin-market', spec: 'github:losebird/dsh-plugin-market#v0.1.1',
    version: 'v0.1.1', author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: 'DSH 的社区插件市场本体：按钮 + 卡片弹窗 + 一键安装。',
    tags: ['market', 'ui'], category: 'market', license: 'MIT', downloads: 0, stars: 0, demo: true, verified: true,
  },
  {
    id: 'demo-hello', name: 'Demo Hello Skill', type: 'pack',
    repo: 'losebird/dsh-plugin-market', spec: 'https://www.dsh-plugin.shop/registry/examples/demo-hello/demo-hello.zip',
    version: 'v0.1.0', author: { name: 'losebird', url: 'https://github.com/losebird' },
    description: '演示扩展包：验证市场安装链路。',
    tags: ['demo', 'skill'], category: 'skills', license: 'MIT', downloads: 0, stars: 0, demo: true, verified: true,
  },
]

async function loadRegistry() {
  const grab = async (name) => {
    const res = await fetch(REGISTRY_BASE + 'registry/' + name)
    return res.ok ? res.json() : null
  }
  try {
    const res = await fetch(RAW_REGISTRY)
    if (res.ok) {
      const parsed = await res.json()
      if (parsed && Array.isArray(parsed.items)) return parsed.items
    }
  } catch {}
  const all = await grab('all.json')
  if (all && Array.isArray(all.items)) return all.items
  const curated = await grab('index.json')
  const auto = await grab('auto.json')
  return [...((curated && curated.items) || []), ...((auto && auto.items) || [])]
}

function fmtNum(n) {
  if (typeof n !== 'number') return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const OS_KEYS = ['darwin', 'linux', 'win32']
const osName = (k) => ({ darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[k] || k)

// 详情页可切换的 README 语言变体
const README_VARIANTS = [
  'README.md', 'readme.md',
  'README_EN.md', 'README.EN.md', 'README.en.md', 'README_en.md',
  'README_zh.md', 'README_ZH.md', 'README.zh.md', 'README_zh-CN.md', 'README_zh_CN.md',
  'README_CN.md', 'README.CN.md', 'README.zh-CN.md', 'README.zh_CN.md',
]
function readmeVariantLabel(f, t) {
  const lf = String(f || '').toLowerCase()
  if (lf === 'readme.md') return t('detail.readmeDefault')
  if (/en/.test(lf)) return 'English'
  if (/zh|cn/.test(lf)) return '中文'
  return f
}

function detectOS() {
  try {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
    if (/win/i.test(p)) return 'win32'
    if (/mac/i.test(p)) return 'darwin'
    return 'linux'
  } catch { return 'darwin' }
}

function installCommands(item) {
  // 返回 { darwin/linux/win32 → 命令 }；无 OS 差异时返回 { any: 命令 }
  const inst = item.install || {}
  const m = inst.method
  if (m === 'script' && inst.os) {
    const out = {}
    for (const k of OS_KEYS) if (inst.os[k]) out[k] = inst.os[k]
    return out
  }
  if (m === 'npm-global' || m === 'command' || m === 'git-clone') return { any: inst.command || '' }
  if (m === 'pack' || m === 'manual' || m === 'desktop') return {}
  return item.type === 'bundle' ? { any: 'dsh plugin --profile web add ' + item.spec } : {}
}

function installCommand(item) {
  const cmds = installCommands(item)
  if (cmds.any) return cmds.any
  if (cmds.darwin || cmds.linux || cmds.win32) return cmds[detectOS()] || cmds.darwin || cmds.linux || cmds.win32 || ''
  return ''
}

const shortName = (n) => String(n || '').split('/').pop() || String(n || '')

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/* ── 小组件 ───────────────────────────────────────── */
function Badges({ item, t }) {
  const { lang } = useLang()
  return (
    <div className="badges">
      <span className="badge badge-cat">{(CATEGORIES[item.category] || CATEGORIES.other)[lang]}</span>
      {item.source === 'curated' && <span className="badge badge-featured">{t('badge.featured')}</span>}
      {item.type === 'pack' && <span className="badge badge-pack">{t('badge.pack')}</span>}
      {item.auto && <span className="badge badge-auto">{t('badge.auto')}</span>}
      {item.verified === false && <span className="badge badge-unver">{t('badge.unver')}</span>}
      {item.demo && <span className="badge">{t('badge.demo')}</span>}
      {item.status === 'unavailable' && <span className="badge badge-off">{t('badge.off')}</span>}
    </div>
  )
}

function Card({ item, onOpen, onToast, onShowCopied }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const cmd = installCommand(item)
  const cmds = installCommands(item)
  const doCopy = async () => {
    if (await copyText(cmd)) {
      setCopied(true)
      onToast(t('toast.copied'))
      if (onShowCopied) onShowCopied(item, cmds)
      setTimeout(() => setCopied(false), 1600)
    }
  }
  return (
    <div className="card">
      <div className="card-top">
        <div className="card-name">{shortName(item.name)}</div>
        <Badges item={item} t={t} />
      </div>
      <div className="card-author">
        {item.author && item.author.url
          ? <a href={item.author.url} target="_blank" rel="noreferrer">{item.author.name}</a>
          : (item.author && item.author.name) || 'Unknown'}
      </div>
      <div className="card-desc">{item.description || ''}</div>
      <div className="card-stats">
        <span title={t('card.stars')}><Star size={14} />{fmtNum(item.stars)}</span>
        {(item.downloads || 0) > 0 && (
          <span title={t('card.downloads')}><DownloadSimple size={14} />{fmtNum(item.downloads)}</span>
        )}
        {item.version && <span>{item.version}</span>}
      </div>
      <div className="card-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(item)} disabled={item.status === 'unavailable'}>
          {t('card.detail')}<CaretRight size={13} />
        </button>
        {item.type !== 'pack' && item.status !== 'unavailable' && cmd && (
          <button className="btn btn-primary btn-sm" onClick={doCopy} title={cmd}>
            {copied ? <><Check size={13} />{t('card.copied')}</> : <><Copy size={13} />{t('card.install')}</>}
          </button>
        )}
        {item.type === 'bundle' && item.status !== 'unavailable' && !cmd && (
          <button className="btn btn-primary btn-sm" onClick={() => onShowCopied && onShowCopied(item, cmds, null, true)}>
            <Copy size={13} />{t('card.install')}
          </button>
        )}
        <span className="spacer" />
      </div>
    </div>
  )
}

function DetailModal({ item, onClose, onToast }) {
  const { t, lang } = useLang()
  const [copied, setCopied] = useState(false)
  const [readme, setReadme] = useState({ status: 'idle' })
  const [variants, setVariants] = useState([])
  const [variant, setVariant] = useState('README.md')
  const readmeCache = useRef({})
  const cmds = installCommands(item)
  const osOptions = OS_KEYS.filter((k) => cmds[k])
  const [osSel, setOsSel] = useState(() => detectOS())
  const effOs = osOptions.includes(osSel) ? osSel : osOptions[0]
  const shownCmd = cmds.any || cmds[effOs] || ''
  const doCopy = async () => {
    if (await copyText(shownCmd)) {
      setCopied(true)
      onToast(t('toast.copied'))
      setTimeout(() => setCopied(false), 1600)
    }
  }

  useEffect(() => {
    let alive = true
    if (!item.repo) { setReadme({ status: 'none' }); return }
    setReadme({ status: 'loading' })
    readmeCache.current = {}
    const base = 'https://raw.githubusercontent.com/' + item.repo + '/HEAD/'
    const renderHtml = (text) => {
      const renderer = new marked.Renderer()
      renderer.image = ({ href, title, text: alt }) => {
        const src = /^https?:/i.test(href || '') ? href : base + (href || '').replace(/^\.\//, '')
        return '<img src="' + src + '" alt="' + (alt || '') + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy">'
      }
      return DOMPurify.sanitize(marked.parse(text, { renderer }))
    }
    fetch(base + 'README.md')
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.text() })
      .then((text) => {
        if (!alive) return
        const html = renderHtml(text)
        readmeCache.current['README.md'] = html
        setReadme({ status: 'ready', html })
      })
      .catch(() => { if (alive) setReadme({ status: 'error' }) })
    // 探测多语言 README 变体（HEAD 优先，CORS 拒绝时退回 GET 探测）
    const seen = new Set()
    Promise.all(README_VARIANTS.map(async (f) => {
      const key = f.toLowerCase()
      if (seen.has(key)) return null
      seen.add(key)
      try {
        const r = await fetch(base + f, { method: 'HEAD' })
        if (r.ok) return f
        const r2 = await fetch(base + f, { method: 'GET', signal: AbortSignal.timeout(6000) })
        if (!r2.ok) return null
        await r2.text()
        return f
      } catch { return null }
    })).then((found) => {
      if (!alive) return
      const v = found.filter(Boolean)
      if (v.length > 1) setVariants(v)
    })
    return () => { alive = false }
  }, [item.repo])

  const selectVariant = (f) => {
    setVariant(f)
    if (readmeCache.current[f]) { setReadme({ status: 'ready', html: readmeCache.current[f] }); return }
    setReadme({ status: 'loading' })
    const base = 'https://raw.githubusercontent.com/' + item.repo + '/HEAD/'
    fetch(base + f)
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.text() })
      .then((text) => {
        const renderer = new marked.Renderer()
        renderer.image = ({ href, title, text: alt }) => {
          const src = /^https?:/i.test(href || '') ? href : base + (href || '').replace(/^\.\//, '')
          return '<img src="' + src + '" alt="' + (alt || '') + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy">'
        }
        const html = DOMPurify.sanitize(marked.parse(text, { renderer }))
        readmeCache.current[f] = html
        setReadme({ status: 'ready', html })
      })
      .catch(() => setReadme({ status: 'error' }))
  }

  const catLabel = (CATEGORIES[item.category] || CATEGORIES.other)[lang]
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{item.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>
        <Badges item={item} t={t} />
        <div className="meta-row">
          <span>{t('detail.author')} {item.author && item.author.name ? item.author.name : 'Unknown'}</span>
          {item.version && <span>{t('detail.version')} {item.version}</span>}
          <span>{t('detail.category')} {catLabel}</span>
          <span>{t('detail.license')} {item.license || 'UNKNOWN'}</span>
          <span>{t('detail.downloads')} {fmtNum(item.downloads)}</span>
          <span><Star size={13} /> {fmtNum(item.stars)}</span>
        </div>
        {item.tags && item.tags.length > 0 && (
          <div className="badges">{item.tags.map((tg) => <span key={tg} className="badge">{tg}</span>)}</div>
        )}
        {item.longDescription && (
          <>
            <h4 className="readme-title">{t('detail.intro')}</h4>
            <div className="long-desc">{item.longDescription}</div>
          </>
        )}
        {item.repo && (
          <>
            <h4 className="readme-title">{t('detail.readme')}{variant.toLowerCase() !== 'readme.md' ? ' · ' + variant : ''}</h4>
            {variants.length > 1 && (
              <div className="install-tabs">
                {variants.map((f) => (
                  <button key={f} className={'os-tab' + (f === variant ? ' on' : '')} onClick={() => selectVariant(f)}>{readmeVariantLabel(f, t)}</button>
                ))}
              </div>
            )}
            {readme.status === 'loading' && <div className="readme-state"><CircleNotch size={14} className="spin" /> {t('detail.readmeLoading')}</div>}
            {readme.status === 'error' && (
              <div className="readme-state">
                {t('detail.readmeError')}
                <a href={'https://github.com/' + item.repo} target="_blank" rel="noreferrer">{t('detail.readmeLink')}</a>
              </div>
            )}
            {readme.status === 'ready' && <div className="readme" dangerouslySetInnerHTML={{ __html: readme.html }} />}
          </>
        )}
        {item.type === 'bundle' && item.install && (item.install.method === 'manual' || item.install.method === 'desktop' || item.install.method === 'git-clone') ? (
          <div className="strip strip-demo"><Warning size={15} /> {t('detail.manualNote')}</div>
        ) : item.type === 'bundle' && item.verified === false ? (
          <div className="strip strip-demo"><Warning size={15} /> {t('detail.unverified')}</div>
        ) : item.type === 'bundle' && shownCmd ? (
          <>
            <div className="install-box">
              {osOptions.length > 1 && (
                <div className="install-tabs">
                  {osOptions.map((k) => (
                    <button key={k} className={'os-tab' + (k === effOs ? ' on' : '')} onClick={() => setOsSel(k)}>{osName(k)}</button>
                  ))}
                </div>
              )}
              <code>{shownCmd}</code>
              <button className="btn btn-primary btn-sm" onClick={doCopy}>{copied ? t('detail.copied') : t('detail.copy')}</button>
            </div>
            <p className="card-desc">{t('detail.bundleNote')}</p>
          </>
        ) : (
          <>
            {/^https:\/\//.test(item.spec || '') && (
              <a className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} href={item.spec} target="_blank" rel="noreferrer">
                <DownloadSimple size={15} />{t('detail.packDownload')}
              </a>
            )}
            <p className="card-desc">{t('detail.packNote')}</p>
          </>
        )}
        <div className="card-actions">
          <a className="btn btn-ghost btn-sm" href={'https://github.com/' + item.repo} target="_blank" rel="noreferrer">
            <GithubLogo size={14} />{t('detail.repo')}
          </a>
          {item.status === 'unavailable' && (
            <span style={{ color: 'var(--error)', fontSize: 13 }}><Warning size={13} /> {t('detail.unavailable')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 复制信息弹窗（卡片安装按钮点击后展示复制内容） ─────────────────────── */
function CopiedModal({ info, onClose, onOpenDetail }) {
  const { t } = useLang()
  if (!info) return null
  const { item, cmds, url, steps } = info
  const osOptions = OS_KEYS.filter((k) => cmds && cmds[k])
  const det = detectOS()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{steps ? t('copiedModal.stepsTitle') : t('copiedModal.title')}</h3>
          <button className="modal-close" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>
        <p className="card-desc" style={{ marginTop: 4 }}>{item.name}</p>
        {url ? (
          <div className="install-box"><code>{url}</code></div>
        ) : cmds && cmds.any ? (
          <div className="install-box"><code>{cmds.any}</code></div>
        ) : osOptions.length > 0 ? (
          <div className="copied-cmds">
            {osOptions.map((k) => (
              <div key={k} className={'copied-cmd' + (k === det ? ' on' : '')}>
                <span className="copied-os">{osName(k)}{k === det ? `（${t('copiedModal.currentMachine')}）` : ''}</span>
                <code>{cmds[k]}</code>
              </div>
            ))}
          </div>
        ) : null}
        {url ? (
          <>
            <p className="card-desc">{t('copiedModal.urlGuide1')}</p>
            <p className="card-desc">{t('copiedModal.urlGuide2')}</p>
          </>
        ) : steps ? (
          <>
            <p className="card-desc">{t('copiedModal.steps1')}</p>
            <p className="card-desc">{t('copiedModal.steps2')}</p>
            <p className="card-desc">{t('copiedModal.steps3')}</p>
            {item.verified === false && <p className="card-desc">{t('copiedModal.stepsUnverified')}</p>}
          </>
        ) : (
          <>
            <p className="card-desc">{t('copiedModal.guide1')}</p>
            <p className="card-desc">{t('copiedModal.guide2')}</p>
          </>
        )}
        <div className="card-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>{t('copiedModal.gotIt')}</button>
          {onOpenDetail && (
            <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onOpenDetail(item) }}>{t('copiedModal.viewDetail')}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function WhaleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <g fill="#ffffff">
        <ellipse cx="128" cy="234" rx="66" ry="30" transform="rotate(-24 128 234)" />
        <ellipse cx="128" cy="306" rx="66" ry="30" transform="rotate(24 128 306)" />
      </g>
      <path d="M150 270 C164 192 244 158 336 160 C428 162 464 214 456 264 C450 310 418 338 372 344 C300 352 200 340 160 304 C144 292 142 282 150 270 Z" fill="#ffffff" />
      <path d="M176 296 C220 330 290 344 352 336 C394 330 422 312 438 288 C410 322 310 348 214 330 C196 326 184 314 176 296 Z" fill="#CFE0FF" />
      <ellipse cx="252" cy="332" rx="44" ry="20" fill="#CFE0FF" transform="rotate(-18 252 332)" />
      <path d="M330 176 C340 148 356 136 372 132 C368 150 366 166 366 178 Z" fill="#CFE0FF" />
      <circle cx="388" cy="244" r="14" fill="#4176E6" />
      <circle cx="393" cy="239" r="4.5" fill="#ffffff" />
      <path d="M448 150 C452 130 452 112 444 94" stroke="#ffffff" strokeWidth="16" strokeLinecap="round" fill="none" />
      <circle cx="438" cy="82" r="8" fill="#ffffff" />
      <circle cx="462" cy="112" r="6" fill="#ffffff" />
    </svg>
  )
}

/* ── 首页安装卡 ───────────────────────────────────── */
function InstallStrip({ onToast }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const doCopy = async () => {
    if (await copyText('dsh plugin --profile web add ' + INSTALL_SPEC)) {
      setCopied(true)
      onToast(t('toast.copied'))
      setTimeout(() => setCopied(false), 1600)
    }
  }
  return (
    <div className="hero-install">
      <span className="hero-install-label"><Plug size={14} weight="fill" />{t('install.title')}</span>
      <code>dsh plugin --profile web add {INSTALL_SPEC}</code>
      <button className="btn btn-primary btn-sm" onClick={doCopy}>
        {copied ? <><Check size={13} />{t('install.copied')}</> : <><Copy size={13} />{t('install.copy')}</>}
      </button>
    </div>
  )
}

/* ── 分页器 ───────────────────────────────────────── */
function Pager({ page, total, onChange }) {
  const { t } = useLang()
  if (total <= 1) return null
  return (
    <div className="pager">
      <button className="btn btn-ghost btn-sm" disabled={page <= 0} onClick={() => onChange(page - 1)}>← {t('dir.pagerPrev')}</button>
      <span className="pager-info">{t('dir.pager', { p: page + 1, total })}</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= total - 1} onClick={() => onChange(page + 1)}>{t('dir.pagerNext')} →</button>
    </div>
  )
}

/* ── 主页面 ───────────────────────────────────────── */
function Home({ items, status, onGoSubmit, onOpenDetail, onToast, onShowCopied }) {
  const { t, lang } = useLang()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)
  const [group, setGroup] = useState('verified')
  const [sort, setSort] = useState('stars')
  const [page, setPage] = useState(0)

  const groupCounts = useMemo(() => {
    let v = 0
    let u = 0
    for (const it of items) {
      if (it.verified === false) u++
      else v++
    }
    const curated = items.filter((it) => it.source === 'curated').length
    const withDate = items.filter((it) => it.releasedAt).length
    return { verified: v, unverified: u, featured: Math.min(100, items.length), new: withDate, handmade: curated }
  }, [items])

  const base = useMemo(() => {
    if (group === 'featured') {
      return [...items].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 100)
    }
    if (group === 'new') {
      return items
        .filter((it) => it.releasedAt)
        .sort((a, b) => String(b.releasedAt).localeCompare(String(a.releasedAt)))
        .slice(0, 200)
    }
    if (group === 'handmade') {
      return items.filter((it) => it.source === 'curated').sort((a, b) => (b.stars || 0) - (a.stars || 0))
    }
    const list = items.filter((it) => (group === 'unverified' ? it.verified === false : it.verified !== false))
    return [...list].sort((a, b) => {
      if (sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0)
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
      return (b.stars || 0) - (a.stars || 0)
    })
  }, [items, group, sort])

  const cats = useMemo(() => {
    const counts = new Map()
    for (const it of base) {
      const c = it.category || 'other'
      counts.set(c, (counts.get(c) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [base])

  const filtered = useMemo(() => {
    return base.filter((it) => {
      if (cat && (it.category || 'other') !== cat) return false
      if (!q) return true
      const hay = [it.name, it.description, it.id, (it.tags || []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [base, cat, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <>
      <section className="shell hero">
        <h1 className="hero-h1">{t('hero.t1')}<br /><span className="accent">{t('hero.t2')}</span></h1>
        <p className="hero-sub">{t('hero.sub')}</p>
        <div className="hero-search">
          <MagnifyingGlass size={20} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0) }}
            placeholder={t('dir.search')}
            aria-label="search"
          />
        </div>
        <div className="hero-stats">
          <span><b>{items.length}</b> {t('hero.statTotal')}</span>
          <span className="dot">·</span>
          <span><b>{groupCounts.verified}</b> {t('hero.statVerified')}</span>
          <span className="dot">·</span>
          <span className="hero-slogan">Everything is a Plugin.</span>
        </div>
        <InstallStrip onToast={onToast} />
      </section>

      <section className="shell section" id="directory">
        <div className="section-head">
          <h2>{t('dir.title')}</h2>
          <span className="count">{t('dir.count', { n: items.length })}</span>
        </div>
        {status === 'demo' && (
          <div className="strip strip-demo"><Warning size={16} /> {t('dir.demo')}</div>
        )}
        <div className="seg">
          <div className="seg-tabs">
            {[
              { key: 'verified', label: t('dir.tabVerified'), icon: CheckCircle },
              { key: 'unverified', label: t('dir.tabUnverified'), icon: Warning },
              { key: 'featured', label: t('dir.tabFeatured'), icon: Sparkle },
              { key: 'new', label: t('dir.tabNew'), icon: Clock },
              { key: 'handmade', label: t('dir.tabHandmade'), icon: UserCircle },
            ].map((g) => {
              const Icon = g.icon
              return (
                <button key={g.key} className={'seg-btn' + (group === g.key ? ' on' : '')} onClick={() => { setGroup(g.key); setCat(null); setPage(0) }}>
                  <Icon size={14} />{g.label} <span className="chip-count">{groupCounts[g.key]}</span>
                </button>
              )
            })}
          </div>
        </div>
        {cats.length > 0 && (
          <div className="tag-row">
            <button className={'tag-chip' + (cat === null ? ' on' : '')} onClick={() => { setCat(null); setPage(0) }}>
              {(CATEGORIES.all || { zh: '全部', en: 'All' })[lang]}
            </button>
            {cats.map(([c, n]) => (
              <button key={c} className={'tag-chip' + (cat === c ? ' on' : '')} onClick={() => { setCat(cat === c ? null : c); setPage(0) }}>
                {(CATEGORIES[c] || CATEGORIES.other)[lang]} <span className="chip-count">{n}</span>
              </button>
            ))}
          </div>
        )}
        {status === 'loading' ? (
          <div className="grid">{Array.from({ length: 6 }).map((_, i) => <div className="skeleton" key={i} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="state">
            <Package size={34} />
            <p>{items.length === 0 ? t('dir.emptyAll') : t('dir.emptyFilter')}</p>
            {items.length === 0 && <button className="btn btn-primary" onClick={onGoSubmit}>{t('hero.upload')}</button>}
          </div>
        ) : (
          <>
            <div className="grid">{pageItems.map((it) => <Card key={it.id} item={it} onOpen={onOpenDetail} onToast={onToast} onShowCopied={onShowCopied} />)}</div>
            <Pager page={safePage} total={totalPages} onChange={setPage} />
          </>
        )}
      </section>

      <Faq />
      <LinksSection />
    </>
  )
}

/* ── FAQ ──────────────────────────────────────────── */
function Faq() {
  const { t } = useLang()
  const items = [
    { q: t('faq.q1'), a: <>{t('faq.a1a')}<code>dsh plugin --profile web add github:losebird/dsh-plugin-market#v0.1.34</code>{t('faq.a1b')}</> },
    { q: t('faq.q2'), a: <>{t('faq.a2a')}<code>{'dsh plugin --profile web add <spec>'}</code>{t('faq.a2b')}</> },
    { q: t('faq.q3'), a: <>{t('faq.a3a')}<code>npx @deepseek-ai/dsh web</code>{t('faq.a3b')}<code>npm install -g @deepseek-ai/dsh</code>{t('faq.a3c')}</> },
    { q: t('faq.q4'), a: <>{t('faq.a4a')}<code>dsh.bundle.patch</code>{t('faq.a4b')}</> },
    { q: t('faq.q7'), a: <>{t('faq.a7')}</> },
    { q: t('faq.q5'), a: <>{t('faq.a5')}</> },
    { q: t('faq.q6'), a: <>{t('faq.a6a')}<code>{'dsh plugin --profile web remove <package>'}</code>{t('faq.a6b')}</> },
  ]
  return (
    <section className="shell section faq" id="faq">
      <div className="section-head"><h2>{t('faq.title')}</h2></div>
      <div className="faq-grid">
        {items.map((it, i) => (
          <div className="faq-card" key={i}>
            <div className="faq-q">{it.q}</div>
            <div className="faq-a">{it.a}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── 资源墙（全宽左对齐） ─────────────────────────── */
function LinksSection() {
  const { t } = useLang()
  const groups = [
    { label: t('links.llm'), items: [
      ['ChatGPT', 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64', 'https://chatgpt.com'],
      ['Claude', 'https://cdn.simpleicons.org/claude', 'https://claude.ai'],
      ['Gemini', 'https://cdn.simpleicons.org/googlegemini', 'https://gemini.google.com'],
      ['DeepSeek', 'https://cdn.simpleicons.org/deepseek', 'https://chat.deepseek.com'],
      ['Kimi', 'https://cdn.simpleicons.org/kimi', 'https://kimi.moonshot.cn'],
      ['Qwen', 'https://cdn.simpleicons.org/qwen', 'https://chat.qwen.ai'],
      ['Perplexity', 'https://cdn.simpleicons.org/perplexity', 'https://www.perplexity.ai'],
    ] },
    { label: t('links.agent'), items: [
      ['Coze', 'https://cdn.simpleicons.org/coze', 'https://www.coze.cn'],
      ['Dify', 'https://cdn.simpleicons.org/dify', 'https://dify.ai'],
      ['n8n', 'https://cdn.simpleicons.org/n8n', 'https://n8n.io'],
    ] },
    { label: t('links.token'), items: [
      ['OpenRouter', 'https://cdn.simpleicons.org/openrouter', 'https://openrouter.ai'],
      ['Hugging Face', 'https://cdn.simpleicons.org/huggingface', 'https://huggingface.co'],
      ['Replicate', 'https://cdn.simpleicons.org/replicate', 'https://replicate.com'],
    ] },
  ]
  return (
    <section className="shell section links-sec" id="links">
      <div className="section-head links-head"><h2>{t('links.title')}</h2></div>
      <div className="links-wall">
        {groups.map((g) => (
          <div className="links-group" key={g.label}>
            <div className="links-label">{g.label}</div>
            <div className="links-items">
              {g.items.map(([name, icon, url]) => (
                <a key={name} className="link-tile" href={url} target="_blank" rel="noreferrer" title={name}>
                  <img src={icon} alt={name} width={26} height={26} loading="lazy" />
                  <span>{name}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── 上传页 ───────────────────────────────────────── */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const BUNDLE_SPEC_RE = /^(github:|git\+)[^\s"']+(#[^\s"']+)?$|^@?[\w.-]+\/[\w.-]+$|^[\w@.-]+$/
const PACK_SPEC_RE = /^https:\/\/[^\s"']+$/

function SubmitPage({ onBack }) {
  const { t } = useLang()
  const [form, setForm] = useState({
    type: 'bundle', id: '', name: '', repo: '', spec: '', version: '',
    package: '', description: '', longDescription: '', tags: '', license: 'MIT',
    authorName: '', authorUrl: '', skills: '', presets: '',
  })
  const [errors, setErrors] = useState({})
  const [copied, setCopied] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setType = (tp) => setForm((f) => ({ ...f, type: tp }))

  const entry = useMemo(() => {
    const e = {
      id: form.id, name: form.name, type: form.type, repo: form.repo, spec: form.spec,
      description: form.description, license: form.license,
      author: { name: form.authorName, url: form.authorUrl },
    }
    if (form.version) e.version = form.version
    if (form.longDescription) e.longDescription = form.longDescription
    if (form.tags) e.tags = form.tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)
    if (form.authorUrl && /^https:\/\//.test(form.authorUrl)) e.author.url = form.authorUrl
    if (form.type === 'bundle' && form.package) e.package = form.package
    if (form.type === 'pack') {
      const skills = form.skills.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
      const presets = form.presets.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
      if (skills.length || presets.length) e.contents = { skills, presets }
    }
    return e
  }, [form])

  const validate = () => {
    const e = {}
    if (!ID_RE.test(form.id)) e.id = t('err.id')
    if (!form.name.trim()) e.name = t('err.name')
    if (!/^[\w.-]+\/[\w.-]+$/.test(form.repo)) e.repo = t('err.repo')
    if (form.type === 'bundle' ? !BUNDLE_SPEC_RE.test(form.spec) : !PACK_SPEC_RE.test(form.spec)) {
      e.spec = form.type === 'bundle' ? t('err.specBundle') : t('err.specPack')
    }
    if (!form.description.trim()) e.description = t('err.desc')
    if (!form.license.trim()) e.license = t('err.license')
    if (!form.authorName.trim()) e.authorName = t('err.author')
    if (form.authorUrl && !/^https:\/\//.test(form.authorUrl)) e.authorUrl = t('err.authorUrl')
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
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />{t('submit.back')}</button>
        <h1>{t('submit.title')}</h1>
      </div>
      <p className="page-sub">{t('submit.sub')}</p>
      <div className="submit-grid">
        <form onSubmit={(e) => { e.preventDefault(); openPR() }}>
          <div className="field">
            <label>{t('submit.type')}</label>
            <div className="radio-row">
              <label className={'radio' + (form.type === 'bundle' ? ' on' : '')}>
                <input type="radio" name="type" checked={form.type === 'bundle'} onChange={() => setType('bundle')} />
                <Plug size={15} />{t('submit.typeBundle')}
              </label>
              <label className={'radio' + (form.type === 'pack' ? ' on' : '')}>
                <input type="radio" name="type" checked={form.type === 'pack'} onChange={() => setType('pack')} />
                <Package size={15} />{t('submit.typePack')}
              </label>
            </div>
          </div>
          <div className="field">
            <label>{t('submit.id')} <span className="req">*</span></label>
            <input value={form.id} onChange={set('id')} placeholder="stock-combo-analyzer" />
            <div className="hint">{t('submit.idHint')}</div>
            {errors.id && <div className="err">{errors.id}</div>}
          </div>
          <div className="field">
            <label>{t('submit.name')} <span className="req">*</span></label>
            <input value={form.name} onChange={set('name')} placeholder="Stock Analyzer" />
            {errors.name && <div className="err">{errors.name}</div>}
          </div>
          <div className="field">
            <label>{t('submit.repo')} <span className="req">*</span></label>
            <input value={form.repo} onChange={set('repo')} placeholder="losebird/dsh-plugin-stock" />
            <div className="hint">{t('submit.repoHint')}</div>
            {errors.repo && <div className="err">{errors.repo}</div>}
          </div>
          <div className="field">
            <label>{t('submit.spec')} <span className="req">*</span></label>
            <input value={form.spec} onChange={set('spec')} placeholder={form.type === 'bundle' ? 'github:losebird/dsh-plugin-stock#v0.1.5' : 'https://github.com/owner/repo/releases/download/tag/pkg.zip'} />
            <div className="hint">{form.type === 'bundle' ? t('submit.specBundleHint') : t('submit.specPackHint')}</div>
            {errors.spec && <div className="err">{errors.spec}</div>}
          </div>
          {form.type === 'bundle' && (
            <div className="field">
              <label>{t('submit.package')}</label>
              <input value={form.package} onChange={set('package')} placeholder="dsh-plugin-stock" />
              <div className="hint">{t('submit.packageHint')}</div>
            </div>
          )}
          <div className="field">
            <label>{t('submit.version')}</label>
            <input value={form.version} onChange={set('version')} placeholder="v0.1.5" />
          </div>
          <div className="field">
            <label>{t('submit.description')} <span className="req">*</span></label>
            <input value={form.description} onChange={set('description')} placeholder="A-share quantitative analysis toolkit" />
            {errors.description && <div className="err">{errors.description}</div>}
          </div>
          <div className="field">
            <label>{t('submit.longDesc')}</label>
            <textarea value={form.longDescription} onChange={set('longDescription')} placeholder={t('submit.longDescPh')} />
          </div>
          <div className="field">
            <label>{t('submit.tags')}</label>
            <input value={form.tags} onChange={set('tags')} placeholder="stock, analysis" />
            <div className="hint">{t('submit.tagsHint')}</div>
          </div>
          <div className="field">
            <label>{t('submit.license')} <span className="req">*</span></label>
            <input value={form.license} onChange={set('license')} placeholder="MIT" />
            {errors.license && <div className="err">{errors.license}</div>}
          </div>
          <div className="field">
            <label>{t('submit.authorName')} <span className="req">*</span></label>
            <input value={form.authorName} onChange={set('authorName')} placeholder="losebird" />
            {errors.authorName && <div className="err">{errors.authorName}</div>}
          </div>
          <div className="field">
            <label>{t('submit.authorUrl')}</label>
            <input value={form.authorUrl} onChange={set('authorUrl')} placeholder="https://github.com/losebird" />
            {errors.authorUrl && <div className="err">{errors.authorUrl}</div>}
          </div>
          {form.type === 'pack' && (
            <>
              <div className="field">
                <label>{t('submit.skills')}</label>
                <input value={form.skills} onChange={set('skills')} placeholder="stock-combo-analyzer" />
                <div className="hint">{t('submit.skillsHint')}</div>
              </div>
              <div className="field">
                <label>{t('submit.presets')}</label>
                <input value={form.presets} onChange={set('presets')} placeholder="stock-analyst" />
                <div className="hint">{t('submit.presetsHint')}</div>
              </div>
            </>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary"><GithubLogo size={16} />{t('submit.pr')}</button>
            <button type="button" className="btn btn-ghost" onClick={doCopy}>{copied ? t('submit.copied') : t('submit.copyJson')}</button>
          </div>
        </form>

        <div className="preview-panel">
          <div className="preview-box">
            <div className="bar"><span>registry/curated/{(form.id || 'plugin')}.json</span><span>{t('submit.preview')}</span></div>
            <pre>{JSON.stringify(entry, null, 2)}</pre>
          </div>
          <div className="check-list">
            <h4>{t('submit.checkTitle')}</h4>
            {form.type === 'bundle' ? (
              <>
                <li><CheckCircle size={15} /> {t('submit.c1')}</li>
                <li><CheckCircle size={15} /> {t('submit.c2')}</li>
                <li><CheckCircle size={15} /> {t('submit.c3')}</li>
                <li><CheckCircle size={15} /> {t('submit.c4')}</li>
              </>
            ) : (
              <>
                <li><CheckCircle size={15} /> {t('submit.p1')}</li>
                <li><CheckCircle size={15} /> {t('submit.p2')}</li>
                <li><CheckCircle size={15} /> {t('submit.p3')}</li>
              </>
            )}
            <li><CheckCircle size={15} /> {t('submit.p4')}</li>
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
  const [toast, setToast] = useState(null)
  const [copiedInfo, setCopiedInfo] = useState(null)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('dsh-market-theme') || 'dark' } catch { return 'light' }
  })
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dsh-market-lang') || 'zh' } catch { return 'zh' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('dsh-market-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem('dsh-market-lang', lang) } catch {}
  }, [lang])

  useEffect(() => {
    let alive = true
    loadRegistry()
      .then((list) => { if (alive) { setItems(list); setStatus('ready') } })
      .catch(() => { if (alive) { setItems(DEMO_ITEMS); setStatus('demo') } })
    return () => { alive = false }
  }, [])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  const t = useMemo(() => (key, vars) => {
    let s = (I18N[lang] && I18N[lang][key]) || key
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]))
    return s
  }, [lang])

  const goSubmit = () => setView('submit')
  const goHome = () => setView('home')

  return (
    <LangCtx.Provider value={{ t, lang, setLang }}>
      <nav className="nav">
        <div className="nav-inner shell">
          <a className="brand" href="#top" onClick={goHome}>
            <span className="brand-mark"><WhaleMark size={16} /></span>
            DSH Plugin Market
          </a>
          <div className="nav-links">
            <button className="nav-link" onClick={() => { goHome(); setTimeout(() => document.getElementById('directory') && document.getElementById('directory').scrollIntoView(), 0) }}>{t('nav.directory')}</button>
            <button className="nav-link" onClick={() => { goHome(); setTimeout(() => document.getElementById('faq') && document.getElementById('faq').scrollIntoView(), 0) }}>{t('faq.title')}</button>
            <a className="nav-link" href={'https://github.com/' + GITHUB_REPO} target="_blank" rel="noreferrer"><GithubLogo size={15} />{t('nav.repo')}</a>
            <button className="nav-link nav-cta" onClick={goSubmit}><UploadSimple size={15} />{t('nav.upload')}</button>
            <button
              className="nav-link"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              aria-label="switch language"
              title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              className="nav-link"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="switch theme"
              title={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </nav>
      <main id="top">
        {view === 'home' ? (
          <Home items={items} status={status} onGoSubmit={goSubmit} onOpenDetail={setDetail} onToast={showToast}
            onShowCopied={(item, cmds, url, steps) => setCopiedInfo({ item, cmds, url, steps })} />
        ) : (
          <SubmitPage onBack={goHome} />
        )}
      </main>
      <footer>
        <div className="footer-inner shell">
          <span>{t('footer.data', { repo: GITHUB_REPO })}</span>
          <span>{t('footer.install')}</span>
        </div>
      </footer>
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} onToast={showToast} />}
      {copiedInfo && (
        <CopiedModal info={copiedInfo} onClose={() => setCopiedInfo(null)} onOpenDetail={(it) => setDetail(it)} />
      )}
      {toast && <div className="toast"><Check size={14} />{toast}</div>}
    </LangCtx.Provider>
  )
}
