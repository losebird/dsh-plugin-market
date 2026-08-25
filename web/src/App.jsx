import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BookOpen, CaretRight, Chats, Check, CheckCircle, CircleNotch, Clock, Copy, DownloadSimple,
  GithubLogo, Graph, Handshake, MagnifyingGlass, Moon, Package, Plug, ShieldCheck, Sparkle, Star, Sun,
  UploadSimple, UserCircle, Warning, X,
} from '@phosphor-icons/react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cardKey, collapsePackageOwnerDuplicates } from '../../scripts/collapse-package-owner.mjs'
import { keyOf, allKeysOf } from '../../scripts/canonicalize-repo.mjs'
import { catalogFromParsed, registryUrls, REGISTRY_TIMEOUT_MS } from '../../src/registry-load.mjs'
import { installPresentation, INSTALL_COPY, helpDownloadUrl, officialDownloadUrl } from '../../src/install-info.mjs'

const GITHUB_REPO = 'losebird/dsh-plugin-market'
const INSTALL_SPEC = '@ace-zone/dsh-market'
const PR_FILE_BASE = 'https://github.com/' + GITHUB_REPO + '/new/main/registry/curated'
const REGISTRY_BASE = import.meta.env.BASE_URL
const RAW_INDEX = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/registry/index.json'
const CURATED_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/registry/curated'
const RAW_CURATED_BASE = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/registry/curated/'
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
    'nav.kit': 'DSH助手套件',
    'nav.themeLight': '切换到亮色主题', 'nav.themeDark': '切换到暗色主题',
    'hero.t1': '发现并安装', 'hero.t2': 'DSH 社区插件',
    'hero.sub': '上千个社区插件与扩展包，一键装进你的 DSH。数据来自 GitHub，每日自动采集。',
    'hero.statTotal': '个插件', 'hero.statVerified': '可一键安装', 'hero.statDaily': '数据来自 GitHub，每日自动采集',
    'hero.browse': '浏览目录', 'hero.upload': '上传插件',
    'install.title': '把插件市场装进你的 DSH',
    'install.after': '重启后，打开设置（Settings），里面会有「插件市场」入口',
    'install.noDshA': '如果本地没有 dsh 命令，请到 ', 'install.noDshB': ' 查找答案。目前插件市场对 MacOS、Linux 友好，Windows 正在努力开发中…',
    'install.copy': '复制安装命令', 'install.copied': '已复制',
    'toast.copied': '安装命令已复制，粘贴到终端执行即可',
    'toast.repo': '项目地址已复制',
    'copiedModal.title': '安装命令已复制',
    'copiedModal.currentMachine': '本机',
    'copiedModal.guide1': '在 DSH 内打开侧栏「插件市场」，找到该插件点一键安装（推荐）；',
    'copiedModal.guide2': '或把命令粘贴到终端直接执行（已在剪贴板）。',
    'copiedModal.gotIt': '知道了', 'copiedModal.viewDetail': '查看详情',
    'copiedModal.appTitle': '官方下载',
    'copiedModal.appGuide1': '打开该系统的官方下载页面。',
    'copiedModal.appGuide2': '不要在终端执行采集到的脚本。',
    'copiedModal.noneTitle': '未验证',
    'copiedModal.noneGuide': INSTALL_COPY.zh.unverNote,
    'dir.title': '插件目录', 'dir.count': '{n} 个条目',
    'dir.demo': 'registry 暂不可用，当前展示演示数据。',
    'dir.search': '搜索名称、简介或标签',
    'dir.sortStars': '按星标', 'dir.sortDownloads': '按下载量', 'dir.sortName': '按名称',
    'dir.tabVerified': '可一键安装', 'dir.tabUnverified': '未验证',
    'dir.tabFeatured': '精选插件', 'dir.tabNew': '最新发布', 'dir.tabHandmade': '大神手作',
    'dir.emptyAll': '目录还是空的。上传第一个插件？', 'dir.emptyFilter': '没有匹配的插件，换个关键词试试。',
    'dir.emptyTab': '没有匹配的插件（{filter}）',
    'dir.pagerPrev': '上一页', 'dir.pagerNext': '下一页', 'dir.pager': '第 {p} / {total} 页',
    'card.detail': '详情', 'card.install': '安装', 'card.officialDownload': INSTALL_COPY.zh.officialDownload, 'card.copied': '已复制', 'card.copyUrl': '复制地址',
    'card.downloads': '下载量', 'card.stars': 'GitHub 星标',
    'badge.pack': '扩展包', 'badge.auto': '自动收录', 'badge.unver': '未验证', 'badge.demo': '演示', 'badge.off': '已下线', 'badge.featured': '精选',
    'detail.author': '作者', 'detail.version': '版本', 'detail.category': '分类', 'detail.license': '许可', 'detail.downloads': '下载',
    'detail.intro': '简介', 'detail.readme': '项目说明', 'detail.readmeLoading': '加载项目说明中…',
    'detail.readmeError': '项目 README 加载失败，', 'detail.readmeLink': '去仓库查看',
    'detail.readmeDefault': '默认',
    'detail.copy': '复制', 'detail.copied': '已复制',
    'detail.pluginNote': '在 DSH 侧栏插件市场点安装；或把下面这条 dsh plugin add 命令粘贴到终端。',
    'detail.packDownload': INSTALL_COPY.zh.packDownload,
    'detail.packNote': INSTALL_COPY.zh.packNote,
    'detail.appNote': INSTALL_COPY.zh.appNote,
    'detail.noneNote': INSTALL_COPY.zh.unverNote,
    'detail.repo': '查看仓库', 'detail.unavailable': '该条目仓库已删除或转为私有',
    'detail.unverified': INSTALL_COPY.zh.unverNote,
    'how.title': '工作原理',
    'how.sub': '没有私有后端。插件数据就是仓库里的 JSON 文件，每天由 GitHub Actions 自动采集、去重、合并，网站与 DSH 弹窗读的是同一份数据。',
    'how.s1t': '作者发布', 'how.s1b': '插件作者在自己的 GitHub 仓库发 Release（bundle 包或 zip 扩展包），构建产物直接提交进仓库，不依赖安装时编译。',
    'how.s2t': 'PR 上架或自动收录', 'how.s2b': '上传页生成条目 JSON，作者向 registry/curated/ 提 PR；合并后大神手作会即时读取 registry/curated/ 现网内容，另由快速合并任务写入 all.json（每日 collect 仍会自动收录带 topic 的仓库）。',
    'how.s3t': '每日合并去重', 'how.s3b': '采集任务汇总下载量与星标，按包名和仓库去重，curated 条目优先，输出 registry/all.json。',
    'how.s4t': 'DSH 内一键安装', 'how.s4b': '用户在 DSH 侧栏的插件市场弹窗里点安装，等价执行 dsh plugin --profile web add，重启后生效。',
    'submit.back': '返回目录', 'submit.title': '上传插件',
    'submit.sub': '填好表单后点击「发起 PR」，会把条目 JSON 带到 GitHub 的新建文件页（registry/curated/<id>.json）。校验通过并合并后，大神手作可立即展示该文件；all.json 由快速合并任务更新。详细规范见仓库 docs/SUBMIT.md。',
    'submit.type': '插件类型', 'submit.typeBundle': 'DSH 插件（bundle，走 dsh plugin add）', 'submit.typePack': '扩展包（skill / preset zip）',
    'submit.id': 'id', 'submit.idHint': '全局唯一标识，用于目录与卸载记录。',
    'submit.name': '名称', 'submit.repo': '仓库', 'submit.repoHint': '插件代码所在的 GitHub 仓库。',
    'submit.spec': '安装源 spec',     'submit.specBundleHint': '已发布的 npm 包名，或 GitHub Release 的 https://…tgz。',
    'submit.specPackHint': 'GitHub Release 里 zip 资产的下载地址（https://…zip）。',
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
    'err.specBundle': '已发布的 npm 包名或 https://…tgz', 'err.specPack': 'https:// 开头的 zip 下载地址',
    'err.desc': '必填', 'err.license': '必填', 'err.author': '必填', 'err.authorUrl': '以 https:// 开头',
    'footer.data': '数据源 github.com/{repo}，每日自动采集，全部可审计',
    'footer.install': '安装请在 DSH 应用内「插件市场」弹窗中完成',
    'faq.title': '常见问题',
    'faq.q1': '如何安装插件市场？', 'faq.a1a': '在终端执行 ', 'faq.a1b': '，然后重启 dsh。重启后打开设置（Settings），在设置面板里找到「插件市场」入口。',
    'faq.q2': '如何在 DSH 里安装插件？', 'faq.a2a': '打开插件市场弹窗，点卡片上的「安装」即可；也可以复制安装命令到终端执行 ', 'faq.a2b': '（把 spec 换成对应插件）。扩展包请下载 zip 后解压：skill 放到 ~/.agents/skills/，preset 放到 ~/.dsh/.agent-presets/。',
    'faq.q3': '为什么我的终端里没有 dsh 命令？', 'faq.a3a': '如果你是用 ', 'faq.a3b': ' 方式启动的，dsh 命令并没有安装到系统里。先全局安装 ', 'faq.a3c': '，之后 dsh 系列命令（dsh web、dsh plugin add 等）就都可用了。',
    'faq.q4': '为什么有些插件标着「未验证」？', 'faq.a4a': '它们的仓库没有声明 ', 'faq.a4b': '，直接 dsh plugin add 只会作为普通依赖安装、不会挂载成插件。请参考作者仓库的手工安装说明。',
    'faq.q5': '安装后插件没有生效？', 'faq.a5': 'bundle 类插件安装后需要重启 dsh 才生效；扩展包里的 skill 在新会话可用，preset 需要在新会话的预设列表中选择。',
    'faq.q6': '如何卸载插件？', 'faq.a6a': '在弹窗里点「卸载」，或在终端执行 ', 'faq.a6b': '（包名可在插件详情里查看）。',
    'faq.q7': '未验证的插件应该怎么安装呢？', 'faq.a7': '没有一键安装。打开详情，到仓库看作者说明。',
    'links.title': '相关资源', 'links.llm': 'AI 大模型', 'links.agent': 'Agent 平台', 'links.token': 'API 中转',
    'kit.back': '返回目录',
    'kit.backHub': '回套件',
    'kit.hero.t1': 'DSH 助手套件',
    'kit.hero.t2': '复杂协作，就用助手套件',
    'kit.hero.sub': '找回放过的资料。向旁边工位借经验。公司系统里的单，用你自己的号去查。',
    'kit.hero.semantic': '语义插件',
    'kit.hero.assist': '协助插件',
    'kit.hero.img': '产品演示：资料连起来、信封送过去、单据打勾',
    'kit.hub.semantic': '找回放过的资料',
    'kit.hub.assist': '向旁边工位借一招',
    'kit.hub.biz': '用你自己的号查单、过单',
    'kit.hub.go': '看看怎么用',
    'kit.hub.platforms': '两个插件，一件事',
    'kit.hub.demo': '产品演示',
    'kit.semantic.name': '语义插件',
    'kit.semantic.line': 'DSH 每次新聊天都是一张白纸。\n装上这个，这个文件夹里聊过的、放过的、点过头的，还能找回来。\n图上记的是当时怎么定的，不是公司系统现在的状态。',
    'kit.semantic.s1t': '把这个项目摊开看',
    'kit.semantic.s1b': '探索页是一张全图。会话、文件、概念挤在一起，底下还能按日期拖。\n你不用自己翻聊天记录。问「上次那套方案放哪了」，能点回原文。',
    'kit.semantic.s1alt': '语义探索：全图、搜索和底部时间轴',
    'kit.semantic.s2t': '当时怎么定的，还能顺着看',
    'kit.semantic.s2b': '决策页把一次拍板拆开：依据是哪段会话，后面又连到什么。\n过了几个月再问「我们当时为啥这么定」，不用靠记性。',
    'kit.semantic.s2alt': '决策记录：一条因果链连回原来的会话',
    'kit.semantic.s3t': '这本记忆能带进带出',
    'kit.semantic.s3b': '导入一份 JSON 或 CSV，或把当前图导出一份快照。\n换电脑、备份、给同事一份当时的记录，不用整台机器拷走。',
    'kit.semantic.s3alt': '导入导出：拖入文件，或下载图快照',
    'kit.semantic.s4t': '这本记忆齐不齐，自己先打分',
    'kit.semantic.s4b': '完整度、一致性、规则有没有对上，一页能看见。\n缺出处、缺标签，早点发现。别等问的时候才知道图是空的。',
    'kit.semantic.s4alt': '规则检查：完整度、一致性和要对的问题',
    'kit.semantic.s5t': '两个工作区能对上话，图不并在一起',
    'kit.semantic.s5b': '建一座桥，跨目录搜会话正文。选好路径就行。\n协助项目和语义项目分开记。你问「那天聊了什么」时，还能搜到对面。',
    'kit.semantic.s5alt': '创建桥：把两个工作区连上，只搜会话不并图',
    'kit.assist.name': '协助插件',
    'kit.assist.line': '卡住了，发给旁边工位。\n对方用自己电脑上的 DSH 总结完，再回给你。',
    'kit.assist.s1t': '先配对，再写信',
    'kit.assist.s1b': '两个人当面报一个码。\n发出去之前要点名。没点名，信发不出去。',
    'kit.assist.s1alt': '协助写信：发出去之前要点名',
    'kit.assist.s2t': '回信落在一张卡上',
    'kit.assist.s2b': '对方回了，屏幕上弹出秘书卡。\n点「只收下」，看看就完。\n点「按他说的做」，你这边才接着干。',
    'kit.assist.s2alt': '秘书卡：只收下，或按他说的做',
    'kit.assist.s3t': '秘书开口，原文还在',
    'kit.assist.s3b': '卡片上能看见信封原文。\n它不会替你签字，也不会自己接着跑。',
    'kit.assist.s3alt': '秘书开口，信封原文标在卡上',
    'kit.biz.badge': '连上公司系统',
    'kit.biz.title': '问旁边工位，用自己的号现查',
    'kit.biz.sub': '两个都装上，再接公司系统。\n信在办公室里走。单用你自己的号去查。图上没有的，不会装成已经查过。',
    'kit.biz.s1t': '先写信，先点名',
    'kit.biz.s1b': '「去年 3 月的订货单发我看下」。\n写给谁，卡片上得写清楚。没点名，发不出去。',
    'kit.biz.s1alt': '协助写信：点名 Ace，写去年 3 月订货单',
    'kit.biz.s2t': '秘书拟好了，你点了才发',
    'kit.biz.s2b': '信封原文还在。点「发出去」，对面才收得到。\n点「先不发」，这封就停在你这边。',
    'kit.biz.s2alt': '秘书卡：发出去，或先不发',
    'kit.biz.s3t': '对面先看见信，再决定谁回',
    'kit.biz.s3b': '回信可以自己打，也可以让秘书拟一句。\n这颗键只表示你同意开口，不是过单。',
    'kit.biz.s3alt': '对方收到协助：自己打，或让秘书拟回',
    'kit.biz.s4t': '秘书拟回，原文还压在下面',
    'kit.biz.s4b': '拟好的是采购单号和状态。\n点「回给对方」才寄出。信封原文还在，不是秘书编的。',
    'kit.biz.s4alt': '秘书拟回：去年 3 月采购单列表',
    'kit.biz.s5t': '图里没有，就去系统里现查',
    'kit.biz.s5b': '先翻这本记忆。图上没有这份清单，就用你自己的号去公司系统里看。\n这封只现查，没有改单。查完另起一封回信。',
    'kit.biz.s5alt': '会话里现查去年 3 月采购单，没有改单',
    'kit.biz.s6t': '回信到了，你点了才接着干',
    'kit.biz.s6b': '点「只收下」，看看就完。\n点「采纳并让模型接着做」，你这边才按他说的往下走。',
    'kit.biz.s6alt': '回信卡：只收下，或采纳并让模型接着做',
  },
  en: {
    'nav.directory': 'Directory', 'nav.how': 'How it works', 'nav.repo': 'Repo', 'nav.upload': 'Submit',
    'nav.kit': 'Assist Kit',
    'nav.themeLight': 'Switch to light theme', 'nav.themeDark': 'Switch to dark theme',
    'hero.t1': 'Discover & install', 'hero.t2': 'DSH community plugins',
    'hero.sub': 'Thousands of community plugins and packs, one click into your DSH. Data from GitHub, collected daily.',
    'hero.statTotal': 'plugins', 'hero.statVerified': 'one-click install', 'hero.statDaily': 'from GitHub, collected daily',
    'hero.browse': 'Browse', 'hero.upload': 'Submit plugin',
    'install.title': 'Install the market into your DSH',
    'install.after': 'After restart, open Settings — the Plugin Market entry is inside',
    'install.noDshA': 'If the dsh command is missing on this machine, check the ', 'install.noDshB': ' for answers. The marketplace currently works best on macOS and Linux; Windows support is under active development…',
    'install.copy': 'Copy install command', 'install.copied': 'Copied',
    'toast.copied': 'Install command copied. Paste it in your terminal to run.',
    'toast.repo': 'Repo URL copied',
    'copiedModal.title': 'Install command copied',
    'copiedModal.currentMachine': 'this device',
    'copiedModal.guide1': 'In DSH, open the Plugin Market and click install on this plugin (recommended);',
    'copiedModal.guide2': 'or paste the command into your terminal (already on your clipboard).',
    'copiedModal.gotIt': 'Got it', 'copiedModal.viewDetail': 'View details',
    'copiedModal.appTitle': 'Official download',
    'copiedModal.appGuide1': 'Open this product\'s official download page.',
    'copiedModal.appGuide2': 'Do not run scraped scripts in your terminal.',
    'copiedModal.noneTitle': 'Unverified',
    'copiedModal.noneGuide': INSTALL_COPY.en.unverNote,
    'dir.title': 'Plugin Directory', 'dir.count': '{n} entries',
    'dir.demo': 'Registry unavailable, showing demo data.',
    'dir.search': 'Search name, description or tags',
    'dir.sortStars': 'By stars', 'dir.sortDownloads': 'By downloads', 'dir.sortName': 'By name',
    'dir.tabVerified': 'One-click install', 'dir.tabUnverified': 'Unverified',
    'dir.tabFeatured': 'Featured', 'dir.tabNew': 'New', 'dir.tabHandmade': 'By Makers',
    'dir.emptyAll': 'The directory is empty. Submit the first plugin?', 'dir.emptyFilter': 'No matching plugins. Try another keyword.',
    'dir.emptyTab': 'No matching plugins ({filter})',
    'dir.pagerPrev': 'Prev', 'dir.pagerNext': 'Next', 'dir.pager': 'Page {p} / {total}',
    'card.detail': 'Details', 'card.install': 'Install', 'card.officialDownload': INSTALL_COPY.en.officialDownload, 'card.copied': 'Copied', 'card.copyUrl': 'Copy URL',
    'card.downloads': 'Downloads', 'card.stars': 'GitHub stars',
    'badge.pack': 'Pack', 'badge.auto': 'Auto', 'badge.unver': 'Unverified', 'badge.demo': 'Demo', 'badge.off': 'Offline', 'badge.featured': 'Featured',
    'detail.author': 'Author', 'detail.version': 'Version', 'detail.category': 'Category', 'detail.license': 'License', 'detail.downloads': 'Downloads',
    'detail.intro': 'About', 'detail.readme': 'README', 'detail.readmeLoading': 'Loading README…',
    'detail.readmeError': 'Failed to load README. ', 'detail.readmeLink': 'View on GitHub',
    'detail.readmeDefault': 'Default',
    'detail.copy': 'Copy', 'detail.copied': 'Copied',
    'detail.pluginNote': 'In DSH, install from the Plugin Market, or paste the dsh plugin add command below.',
    'detail.packDownload': INSTALL_COPY.en.packDownload,
    'detail.packNote': INSTALL_COPY.en.packNote,
    'detail.appNote': INSTALL_COPY.en.appNote,
    'detail.noneNote': INSTALL_COPY.en.unverNote,
    'detail.repo': 'View repo', 'detail.unavailable': 'This repo has been deleted or made private',
    'detail.unverified': INSTALL_COPY.en.unverNote,
    'how.title': 'How it works',
    'how.sub': 'No private backend. Plugin data is just JSON files in the repo, collected, deduplicated and merged by GitHub Actions daily. The website and the DSH modal read the same data.',
    'how.s1t': 'Authors publish', 'how.s1b': 'Authors cut a Release in their GitHub repo (bundle package or zip pack) and commit build artifacts instead of relying on install-time builds.',
    'how.s2t': 'PR or auto-collection', 'how.s2b': 'The submit page generates the entry JSON; authors PR it into registry/curated/. After merge, By Makers reads registry/curated/ live on the site; a fast merge job also writes into all.json (daily collect still scrapes topic-tagged repos).',
    'how.s3t': 'Daily merge & dedup', 'how.s3b': 'The collector aggregates downloads and stars, dedups by package name and repo, prefers curated entries, and writes registry/all.json.',
    'how.s4t': 'One-click install in DSH', 'how.s4b': 'Users click install in the DSH sidebar modal, which runs dsh plugin --profile web add. Restart to activate.',
    'submit.back': 'Back to directory', 'submit.title': 'Submit a plugin',
    'submit.sub': 'Fill the form and click Submit PR to open a GitHub new-file page at registry/curated/<id>.json. After the PR is merged, By Makers can show the file immediately; all.json is updated by the fast merge job. See docs/SUBMIT.md.',
    'submit.type': 'Type', 'submit.typeBundle': 'DSH plugin (bundle, via dsh plugin add)', 'submit.typePack': 'Pack (skill / preset zip)',
    'submit.id': 'id', 'submit.idHint': 'Globally unique id used for the directory and uninstall bookkeeping.',
    'submit.name': 'Name', 'submit.repo': 'Repo', 'submit.repoHint': 'The GitHub repo hosting the plugin code.',
    'submit.spec': 'Install spec',     'submit.specBundleHint': 'A published npm package name, or an https://…tgz release asset.',
    'submit.specPackHint': 'Download URL of the zip asset in a GitHub Release (https://…zip).',
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
    'err.specBundle': 'A published npm package name or an https://…tgz URL', 'err.specPack': 'An https:// zip download URL',
    'err.desc': 'Required', 'err.license': 'Required', 'err.author': 'Required', 'err.authorUrl': 'Must start with https://',
    'footer.data': 'Data source github.com/{repo}, collected daily, fully auditable',
    'footer.install': 'Install from the Plugin Market modal inside DSH',
    'faq.title': 'FAQ',
    'faq.q1': 'How do I install the market itself?', 'faq.a1a': 'Run ', 'faq.a1b': ' in your terminal, then restart dsh. Open Settings afterwards — the Plugin Market is a section inside Settings.',
    'faq.q2': 'How do I install a plugin?', 'faq.a2a': 'Open the market modal and click Install on a card, or copy the command and run ', 'faq.a2b': ' (replace with the plugin spec). For packs, download the zip and unpack — skills to ~/.agents/skills/, presets to ~/.dsh/.agent-presets/.',
    'faq.q3': 'Why is there no dsh command in my terminal?', 'faq.a3a': 'If you started dsh with ', 'faq.a3b': ', the dsh command is not installed on your system. Install it globally with ', 'faq.a3c': ', then all dsh commands (dsh web, dsh plugin add, etc.) become available.',
    'faq.q4': 'Why are some plugins marked Unverified?', 'faq.a4a': 'Their repos do not declare ', 'faq.a4b': ', so dsh plugin add would only add them as plain dependencies without mounting. Check the repo for manual install steps.',
    'faq.q5': 'Installed but not taking effect?', 'faq.a5': 'Bundle plugins require a dsh restart. Skills from packs are available in new sessions; presets must be selected in a new session\'s preset list.',
    'faq.q6': 'How do I uninstall?', 'faq.a6a': 'Click Uninstall in the modal, or run ', 'faq.a6b': ' (find the package name in the plugin detail).',
    'faq.q7': 'How do I install an Unverified plugin?', 'faq.a7': 'There is no one-click install. Open Details and check the repo for the author\'s notes.',
    'links.title': 'Related', 'links.llm': 'LLMs', 'links.agent': 'Agent', 'links.token': 'API Relays',
    'kit.back': 'Back to directory',
    'kit.backHub': 'Back to kit',
    'kit.hero.t1': 'DSH Assist Kit',
    'kit.hero.t2': 'Hard collaboration. Use the kit.',
    'kit.hero.sub': 'Find what you stored. Borrow a move from the next desk. Look up a company form with your own login.',
    'kit.hero.semantic': 'Semantic',
    'kit.hero.assist': 'Assist',
    'kit.hero.img': 'Product demo: notes connect, an envelope moves, a form is checked',
    'kit.hub.semantic': 'Find what you already stored',
    'kit.hub.assist': 'Borrow a move from the next desk',
    'kit.hub.biz': 'Look up and approve with your own login',
    'kit.hub.go': 'See how',
    'kit.hub.platforms': 'Two plugins. One job.',
    'kit.hub.demo': 'Product demo',
    'kit.semantic.name': 'Semantic plugin',
    'kit.semantic.line': 'Every new DSH chat starts blank.\nWith this, chats, files, and boards in this folder can still be found.\nThe graph is what was true then, not live status from a company system.',
    'kit.semantic.s1t': 'Lay the project out',
    'kit.semantic.s1b': 'Explore is one full graph. Chats, files, and concepts sit together. Drag the timeline below.\nYou do not dig through history. Ask where last month’s plan went, and tap back to the original.',
    'kit.semantic.s1alt': 'Semantic explore: full graph, search, and a timeline',
    'kit.semantic.s2t': 'See how you decided then',
    'kit.semantic.s2b': 'A decision page splits one board: which chat supported it, and what it led to.\nMonths later you can still ask why you decided that way, without relying on memory.',
    'kit.semantic.s2alt': 'A decision record with a chain back to the original chat',
    'kit.semantic.s3t': 'Take this memory in and out',
    'kit.semantic.s3b': 'Import a JSON or CSV, or export a snapshot of the current graph.\nMove machines, keep a backup, or hand a colleague the record from then. You do not copy the whole computer.',
    'kit.semantic.s3alt': 'Import and export: drop a file, or download a graph snapshot',
    'kit.semantic.s4t': 'See if this memory is complete',
    'kit.semantic.s4b': 'Completeness, consistency, and whether the rules line up sit on one page.\nMissing sources or labels show up early. You do not wait until a question comes back empty.',
    'kit.semantic.s4alt': 'Rule check: completeness, consistency, and issues to fix',
    'kit.semantic.s5t': 'Two folders can talk. The graphs stay apart.',
    'kit.semantic.s5b': 'Build a bridge and search chat text across folders. Pick the path. That is all.\nAssist and semantic stay in their own records. Ask what you talked about that day, and the other side still comes up.',
    'kit.semantic.s5alt': 'Create a bridge: connect two workspaces, search chats, do not merge graphs',
    'kit.assist.name': 'Assist plugin',
    'kit.assist.line': 'Stuck? Send it to the next desk.\nThey summarize from their own DSH and send it back.',
    'kit.assist.s1t': 'Pair first, then write',
    'kit.assist.s1b': 'Two people share a code in the room.\nName who it is for. No name, no send.',
    'kit.assist.s1alt': 'Compose an assist request. Name the person first.',
    'kit.assist.s2t': 'The reply lands on a card',
    'kit.assist.s2b': 'A secretary card pops up.\nKeep only means look.\nDo as they said lets your side continue.',
    'kit.assist.s2alt': 'Secretary card: keep only, or do as they said',
    'kit.assist.s3t': 'The secretary talks. The original stays.',
    'kit.assist.s3b': 'The card still shows the envelope text.\nIt will not sign for you, and it will not keep going on its own.',
    'kit.assist.s3alt': 'Secretary speaking, with the original envelope marked on the card',
    'kit.biz.badge': 'Company systems',
    'kit.biz.title': 'Ask the next desk. Look it up with your login.',
    'kit.biz.sub': 'Install both, then connect the company system.\nMail stays in the office. Forms are checked with your own login. If the graph has nothing, it does not pretend it already looked.',
    'kit.biz.s1t': 'Write first. Name them first.',
    'kit.biz.s1b': '“Send me last March’s purchase orders.”\nThe card has to say who it is for. No name, no send.',
    'kit.biz.s1alt': 'Compose an assist: name Ace, ask for last March’s orders',
    'kit.biz.s2t': 'The secretary drafted it. You tap, then it goes.',
    'kit.biz.s2b': 'The envelope text is still there. Tap Send, and the other side gets it.\nTap Hold, and it stays on your desk.',
    'kit.biz.s2alt': 'Secretary card: send, or hold',
    'kit.biz.s3t': 'They see the letter first, then decide who replies',
    'kit.biz.s3b': 'They can type it, or let the secretary draft a line.\nThat tap only means they agree to speak. It is not an approval.',
    'kit.biz.s3alt': 'Incoming assist: type it, or let the secretary draft',
    'kit.biz.s4t': 'The draft sits on top. The original stays below.',
    'kit.biz.s4b': 'The draft is purchase-order numbers and status.\nTap Reply to send it. The envelope text is still the original, not something the secretary made up.',
    'kit.biz.s4alt': 'Secretary draft: last March’s purchase-order list',
    'kit.biz.s5t': 'If the graph has nothing, look it up live',
    'kit.biz.s5b': 'It searches this memory first. No list on the graph, so it opens the company system with your login.\nThis letter is a lookup. It does not change the form. Then it writes a separate reply.',
    'kit.biz.s5alt': 'Live lookup of last March’s purchase orders. No change.',
    'kit.biz.s6t': 'The reply lands. You tap before anything continues.',
    'kit.biz.s6b': 'Keep only means look.\nAdopt and continue lets your side follow what they said.',
    'kit.biz.s6alt': 'Reply card: keep only, or adopt and let the model continue',
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
  const grab = async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }
  // 先读站点自己的 /registry/all.json，raw.githubusercontent.com 在国内常被墙或挂起
  const pagesAll = REGISTRY_BASE + 'registry/all.json'
  for (const url of registryUrls({ pagesUrl: pagesAll })) {
    const items = catalogFromParsed(await grab(url))
    if (items) return items
  }
  const curated = await grab(REGISTRY_BASE + 'registry/index.json')
  const auto = await grab(REGISTRY_BASE + 'registry/auto.json')
  const merged = [...((curated && curated.items) || []), ...((auto && auto.items) || [])]
  if (merged.length > 0) return collapsePackageOwnerDuplicates(merged, { preferCurated: true })
  throw new Error('registry unavailable')
}

function normalizeCuratedItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.source) return raw
  return { ...raw, source: 'curated' }
}

function overlayCatalog(baseItems, curatedItems) {
  const items = (baseItems || []).slice()
  const indexByKey = new Map()
  const remember = (it, i) => {
    indexByKey.set(keyOf(it), i)
    for (const k of allKeysOf(it)) indexByKey.set(k, i)
  }
  for (let i = 0; i < items.length; i++) remember(items[i], i)
  for (const raw of curatedItems || []) {
    const n = normalizeCuratedItem(raw)
    if (!n) continue
    let idx = -1
    for (const k of [keyOf(n), ...allKeysOf(n)]) {
      if (indexByKey.has(k)) { idx = indexByKey.get(k); break }
    }
    if (idx >= 0) {
      items[idx] = n
      remember(n, idx)
    } else {
      remember(n, items.length)
      items.push(n)
    }
  }
  return items
}

async function loadLiveCurated() {
  try {
    let indexItems = []
    let githubIndexOk = false
    try {
      const res = await fetch(RAW_INDEX)
      if (res.ok) {
        githubIndexOk = true
        const parsed = await res.json()
        if (parsed && Array.isArray(parsed.items)) indexItems = parsed.items
      }
    } catch {}
    if (!githubIndexOk) {
      try {
        const res = await fetch(REGISTRY_BASE + 'registry/index.json')
        if (res.ok) {
          const parsed = await res.json()
          if (parsed && Array.isArray(parsed.items)) indexItems = parsed.items
        }
      } catch {}
    }

    let files = []
    try {
      const res = await fetch(CURATED_API, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.ok) {
        const listing = await res.json()
        if (Array.isArray(listing)) {
          files = listing.filter((f) => f.type === 'file' && f.name !== '.gitkeep' && f.name.endsWith('.json'))
        }
      }
    } catch {}

    const fileItems = await Promise.all(files.map(async (f) => {
      try {
        const url = f.download_url || (RAW_CURATED_BASE + f.name)
        const res = await fetch(url)
        if (!res.ok) return null
        return await res.json()
      } catch { return null }
    }))

    const merged = overlayCatalog(indexItems, fileItems.filter(Boolean))
    return merged.length > 0 ? merged : []
  } catch {
    return []
  }
}

function fmtNum(n) {
  if (typeof n !== 'number') return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function readmeVariantLabel(f, t) {
  const lf = String(f || '').toLowerCase()
  if (lf === 'readme.md') return t('detail.readmeDefault')
  if (/en/.test(lf)) return 'English'
  if (/zh|cn/.test(lf)) return '中文'
  return f
}

// 详情页可切换的 README 语言变体
const README_VARIANTS = [
  'README.md', 'readme.md',
  'README_EN.md', 'README.EN.md', 'README.en.md', 'README_en.md',
  'README_zh.md', 'README_ZH.md', 'README.zh.md', 'README_zh-CN.md', 'README_zh_CN.md',
  'README_CN.md', 'README.CN.md', 'README.zh-CN.md', 'README.zh_CN.md',
]

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
  const info = installPresentation(item)
  const doInstall = async () => {
    if (!info.command) return
    if (await copyText(info.command)) {
      setCopied(true)
      onToast(t('toast.copied'))
      if (onShowCopied) onShowCopied({ item, kind: info.kind, cmds: { any: info.command } })
      setTimeout(() => setCopied(false), 1600)
    }
  }
  const showInstall = (info.kind === 'plugin' || info.kind === 'companion') && item.status !== 'unavailable'
  const showHelpInstall = (info.kind === 'app' || info.kind === 'pack' || info.kind === 'none') && item.status !== 'unavailable'
  const doHelpInstall = () => {
    if (onShowCopied) onShowCopied({ item, kind: info.kind, url: helpDownloadUrl(item), help: true })
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
        {showInstall && (
          <button className="btn btn-primary btn-sm" onClick={doInstall} title={info.command}>
            {copied ? <><Check size={13} />{t('card.copied')}</> : <><Copy size={13} />{t('card.install')}</>}
          </button>
        )}
        {showHelpInstall && (
          <button className="btn btn-primary btn-sm" onClick={doHelpInstall}>
            {t('card.install')}
          </button>
        )}
        <span className="spacer" />
      </div>
    </div>
  )
}

function DetailModal({ item, onClose, onToast, onShowCopied }) {
  const { t, lang } = useLang()
  const [copied, setCopied] = useState(false)
  const [readme, setReadme] = useState({ status: 'idle' })
  const [variants, setVariants] = useState([])
  const [variant, setVariant] = useState('README.md')
  const readmeCache = useRef({})
  const info = installPresentation(item)
  const showHelpInstall = (info.kind === 'app' || info.kind === 'pack' || info.kind === 'none') && item.status !== 'unavailable'
  const doHelpInstall = () => {
    if (onShowCopied) onShowCopied({ item, kind: info.kind, url: helpDownloadUrl(item), help: true })
  }
  const doCopy = async () => {
    if (!info.command) return
    if (await copyText(info.command)) {
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
        {info.kind === 'plugin' || info.kind === 'companion' ? (
          <>
            <div className="install-box">
              <code>{info.command}</code>
              <button className="btn btn-primary btn-sm" onClick={doCopy}>{copied ? t('detail.copied') : t('detail.copy')}</button>
            </div>
            <p className="card-desc">{t('detail.pluginNote')}</p>
          </>
        ) : info.kind === 'pack' ? (
          <>
            {info.downloadUrl && (
              <a className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} href={info.downloadUrl} target="_blank" rel="noreferrer">
                <DownloadSimple size={15} />{t('detail.packDownload')}
              </a>
            )}
            <p className="card-desc">{t('detail.packNote')}</p>
          </>
        ) : info.kind === 'app' ? (
          <>
            {info.downloadUrl && (
              <a className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} href={info.downloadUrl} target="_blank" rel="noreferrer">
                <DownloadSimple size={15} />{t('card.officialDownload')}
              </a>
            )}
            <p className="card-desc">{t('detail.appNote')}</p>
          </>
        ) : (
          <>
            {item.verified === false && (
              <div className="strip strip-demo"><Warning size={15} /> {t('detail.unverified')}</div>
            )}
            <p className="card-desc">{t('detail.noneNote')}</p>
          </>
        )}
        <div className="card-actions">
          <a className="btn btn-ghost btn-sm" href={'https://github.com/' + item.repo} target="_blank" rel="noreferrer">
            <GithubLogo size={14} />{t('detail.repo')}
          </a>
          {showHelpInstall && (
            <button className="btn btn-primary btn-sm" onClick={doHelpInstall}>
              {t('card.install')}
            </button>
          )}
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
  const { t, lang } = useLang()
  if (!info) return null
  const { item, kind, cmds, url, help } = info
  let effKind = kind
  if (!effKind) {
    if (url) effKind = 'app'
    else if (cmds && cmds.any) effKind = 'plugin'
    else effKind = 'none'
  }
  if (help && (effKind === 'app' || effKind === 'pack' || effKind === 'none')) {
    const helpBody = effKind === 'app' ? INSTALL_COPY[lang].appHelp
      : effKind === 'pack' ? INSTALL_COPY[lang].packHelp
        : INSTALL_COPY[lang].unverHelp
    const downloadLabel = effKind === 'pack' ? INSTALL_COPY[lang].packDownload
      : effKind === 'app' ? INSTALL_COPY[lang].officialDownload
        : (officialDownloadUrl(item) ? INSTALL_COPY[lang].openDownload : INSTALL_COPY[lang].openRepo)
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h3>{INSTALL_COPY[lang].helpTitle}</h3>
            <button className="modal-close" onClick={onClose} aria-label="close"><X size={18} /></button>
          </div>
          <p className="card-desc" style={{ marginTop: 4 }}>{item.name}</p>
          <p className="card-desc">{helpBody}</p>
          {url && (
            <div className="install-box">
              <a href={url} target="_blank" rel="noreferrer">{downloadLabel}</a>
            </div>
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
  const titleKey = effKind === 'app' ? 'copiedModal.appTitle'
    : effKind === 'none' ? 'copiedModal.noneTitle'
      : 'copiedModal.title'
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t(titleKey)}</h3>
          <button className="modal-close" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>
        <p className="card-desc" style={{ marginTop: 4 }}>{item.name}</p>
        {(effKind === 'plugin' || effKind === 'companion') && cmds && cmds.any ? (
          <div className="install-box"><code>{cmds.any}</code></div>
        ) : effKind === 'app' && url ? (
          <div className="install-box"><a href={url} target="_blank" rel="noreferrer">{url}</a></div>
        ) : effKind === 'pack' && url ? (
          <div className="install-box"><a href={url} target="_blank" rel="noreferrer">{url}</a></div>
        ) : null}
        {effKind === 'app' ? (
          <>
            <p className="card-desc">{t('copiedModal.appGuide1')}</p>
            <p className="card-desc">{t('copiedModal.appGuide2')}</p>
          </>
        ) : effKind === 'none' ? (
          <p className="card-desc">{t('copiedModal.noneGuide')}</p>
        ) : effKind === 'pack' ? (
          <p className="card-desc">{t('detail.packNote')}</p>
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

function WhaleMark({ size = 22 }) {
  return (
    <svg width={Math.round(size * 27 / 22)} height={size} viewBox="0 -2 27 22" aria-hidden="true" color="#4176E6">
      <g transform="translate(26.797 0) scale(-1 1)"><g clipPath="url(#whale-clip)">
        <path d="M26.5174 3.39471C26.235 3.2567 26.1137 3.52006 25.9487 3.65346C25.8923 3.69659 25.8446 3.75294 25.7969 3.80469C25.3846 4.24516 24.9027 4.53439 24.2737 4.49989C23.3536 4.44814 22.5682 4.73737 21.8735 5.44119C21.7258 4.57349 21.2353 4.0554 20.4889 3.72304C20.0985 3.55054 19.7034 3.37746 19.4297 3.00197C19.2388 2.73459 19.1865 2.43673 19.091 2.14289C19.0301 1.96579 18.9697 1.78466 18.7656 1.75418C18.5442 1.71968 18.4574 1.90541 18.3705 2.06067C18.0232 2.69549 17.8887 3.39471 17.9019 4.10313C17.9324 5.6965 18.6051 6.96556 19.9421 7.86834C20.0939 7.97184 20.133 8.07535 20.0852 8.22658C19.9938 8.53766 19.8857 8.83955 19.7903 9.15063C19.7293 9.34901 19.6384 9.39271 19.4257 9.30588C18.692 8.9994 18.0583 8.54571 17.4982 7.99772C16.5477 7.07827 15.6881 6.06336 14.6162 5.26869C14.3644 5.08296 14.1125 4.91045 13.8521 4.746C12.7584 3.68394 13.9952 2.81164 14.2816 2.70814C14.5812 2.60003 14.3857 2.22857 13.4179 2.23317C12.4502 2.2372 11.5646 2.56151 10.4359 2.99335C10.2708 3.05832 10.0972 3.10547 9.91951 3.14457C8.8954 2.95022 7.83162 2.90709 6.72069 3.03245C4.62877 3.26533 2.95777 4.25436 1.72954 5.94261C0.254043 7.97184 -0.0932678 10.2777 0.33167 12.6824C0.778458 15.2171 2.07225 17.3153 4.06008 18.9558C6.12152 20.6567 8.49577 21.4905 11.2047 21.3306C12.8498 21.2358 14.6812 21.0155 16.7473 19.2669C17.2682 19.5262 17.8151 19.6297 18.7219 19.7074C19.4205 19.7723 20.0933 19.6729 20.6143 19.5648C21.4302 19.3923 21.3739 18.6367 21.0789 18.4981C18.6874 17.3843 19.2124 17.8374 18.7351 17.4706C19.9501 16.033 21.8063 13.4776 22.379 9.99821C22.4353 9.61409 22.5072 9.073 22.4986 8.76192C22.494 8.57216 22.5377 8.49856 22.7545 8.47671C23.3536 8.40771 23.935 8.24383 24.4692 7.94999C26.0188 7.10357 26.6439 5.71318 26.7911 4.04678C26.8129 3.79204 26.7865 3.52869 26.5174 3.39471ZM13.0143 18.3946C10.6964 16.5724 9.5722 15.9726 9.10816 15.9985C8.67402 16.0244 8.75222 16.5212 8.84768 16.8449C8.94773 17.1646 9.07768 17.3849 9.25996 17.6655C9.38589 17.8512 9.47272 18.1272 9.13404 18.3348C8.38766 18.7965 7.08985 18.1796 7.0289 18.1491C5.51833 17.2595 4.25559 16.0853 3.36546 14.4793C2.50581 12.9337 2.0067 11.2753 1.92447 9.50542C1.90262 9.07818 2.02855 8.92695 2.45406 8.84932C3.01413 8.74582 3.59144 8.72397 4.15093 8.80619C6.51656 9.15178 8.53027 10.2092 10.2185 11.8848C11.1822 12.8388 11.9114 13.979 12.6623 15.0929C13.461 16.2757 14.3201 17.4027 15.4144 18.3268C15.8008 18.6505 16.109 18.8966 16.404 19.0783C15.5144 19.1778 14.0297 19.1991 13.0143 18.3958V18.3946ZM14.1252 11.2489C14.1252 11.0591 14.277 10.9079 14.4679 10.9079C14.511 10.9079 14.5501 10.9165 14.5852 10.9292C14.6329 10.9464 14.6766 10.9723 14.7111 11.0114C14.7721 11.0718 14.8066 11.158 14.8066 11.2489C14.8066 11.4386 14.6548 11.5899 14.4639 11.5899C14.273 11.5899 14.1252 11.4386 14.1252 11.2489ZM17.5759 13.0188C17.3545 13.1096 17.1331 13.1873 16.9203 13.1959C16.5903 13.2131 16.2303 13.0791 16.0348 12.9153C15.7312 12.6605 15.5139 12.5179 15.423 12.0734C15.3839 11.8837 15.4057 11.5899 15.4402 11.4214C15.5185 11.0585 15.4316 10.8257 15.1757 10.614C14.9676 10.4415 14.7025 10.3938 14.4115 10.3938C14.3029 10.3938 14.2034 10.3461 14.1292 10.3076C14.0079 10.2472 13.9078 10.096 14.0033 9.91023C14.0338 9.84985 14.1815 9.70322 14.216 9.67734C14.6111 9.45251 15.0665 9.52612 15.488 9.6946C15.8784 9.85445 16.174 10.1477 16.5989 10.5623C17.033 11.0631 17.1112 11.2011 17.3585 11.5772C17.554 11.871 17.7317 12.1729 17.8536 12.5185C17.9272 12.7341 17.8317 12.9107 17.5759 13.0188Z" fill="currentColor" />
      </g></g>
      <defs>
        <clipPath id="whale-clip">
          <rect width="26.634" height="19.6" fill="white" transform="translate(0.163086 1.75)" />
        </clipPath>
      </defs>
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
    <>
      <div className="hero-install">
        <span className="hero-install-label"><Plug size={14} weight="fill" />{t('install.title')}</span>
        <code>dsh plugin --profile web add {INSTALL_SPEC}</code>
        <button className="btn btn-primary btn-sm" onClick={doCopy}>
          {copied ? <><Check size={13} />{t('install.copied')}</> : <><Copy size={13} />{t('install.copy')}</>}
        </button>
      </div>
      <p className="hero-install-note">
        {t('install.noDshA')}<a href="#faq">FAQ</a>{t('install.noDshB')}
      </p>
    </>
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
    const normSearch = (s) => String(s || '').toLowerCase().replace(/_/g, '-')
    const qTrimmed = q.trim()
    const source = qTrimmed
      ? [...items].sort((a, b) => {
        if (sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0)
        if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
        return (b.stars || 0) - (a.stars || 0)
      })
      : base
    const qv = normSearch(qTrimmed)
    return source.filter((it) => {
      if (cat && (it.category || 'other') !== cat) return false
      if (!qTrimmed) return true
      const hay = normSearch([it.name, it.description, it.repo, it.package, it.id, (it.tags || []).join(' ')].join(' '))
      return hay.includes(qv)
    })
  }, [items, base, cat, q, sort])

  const emptyMsg = useMemo(() => {
    if (items.length === 0) return t('dir.emptyAll')
    if (q.trim()) return t('dir.emptyFilter')
    const tabLabels = {
      verified: t('dir.tabVerified'),
      unverified: t('dir.tabUnverified'),
      featured: t('dir.tabFeatured'),
      new: t('dir.tabNew'),
      handmade: t('dir.tabHandmade'),
    }
    let filter = tabLabels[group] || ''
    if (cat) filter += ' · ' + (CATEGORIES[cat] || CATEGORIES.other)[lang]
    return t('dir.emptyTab', { filter })
  }, [items.length, q, cat, group, t, lang])

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
            <p>{emptyMsg}</p>
            {items.length === 0 && <button className="btn btn-primary" onClick={onGoSubmit}>{t('hero.upload')}</button>}
          </div>
        ) : (
          <>
            <div className="grid">{pageItems.map((it) => <Card key={cardKey(it)} item={it} onOpen={onOpenDetail} onToast={onToast} onShowCopied={onShowCopied} />)}</div>
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
    { q: t('faq.q1'), a: <>{t('faq.a1a')}<code>{'dsh plugin --profile web add ' + INSTALL_SPEC}</code>{t('faq.a1b')}</> },
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

/* ── 助手套件 ─────────────────────────────────────── */
function KitShot({ src, alt, title, body, flip }) {
  const { t } = useLang()
  return (
    <section className={'kit-shot' + (flip ? ' flip' : '')}>
      <figure className="kit-figure kit-figure-shot">
        <img src={REGISTRY_BASE + src} alt={t(alt)} />
      </figure>
      <div>
        <h2 className="kit-h2">{t(title)}</h2>
        <p className="kit-line kit-break">{t(body)}</p>
      </div>
    </section>
  )
}

function KitHub({ onBack, onOpen }) {
  const { t } = useLang()
  const bands = [
    { id: 'kit-semantic', video: 'kit/band-semantic.mp4', poster: 'kit/band-semantic.jpg', alt: 'kit.semantic.s1alt', name: 'kit.semantic.name', line: 'kit.semantic.line' },
    { id: 'kit-assist', video: 'kit/band-assist.mp4', poster: 'kit/band-assist.jpg', alt: 'kit.assist.s1alt', name: 'kit.assist.name', line: 'kit.assist.line' },
    { id: 'kit-biz', video: 'kit/band-biz.mp4', poster: 'kit/band-biz.jpg', alt: 'kit.biz.s2alt', name: 'kit.biz.badge', line: 'kit.biz.sub' },
  ]
  return (
    <div className="shell kit kit-hub">
      <div className="kit-stage kit-stage-center">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />{t('kit.back')}</button>
        <p className="kit-brand">{t('kit.hero.t1')}</p>
        <h1 className="kit-headline">{t('kit.hero.t2')}</h1>
        <p className="kit-lead">{t('kit.hero.sub')}</p>
        <div className="kit-hero-row kit-hero-center">
          <button type="button" className="btn btn-primary" onClick={() => onOpen('kit-semantic')}>{t('kit.hero.semantic')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => onOpen('kit-assist')}>{t('kit.hero.assist')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => onOpen('kit-biz')}>{t('kit.biz.badge')}</button>
        </div>
      </div>
      <figure className="kit-demo">
        <video
          src={REGISTRY_BASE + 'kit/demo.mp4'}
          poster={REGISTRY_BASE + 'kit/shot-biz-form.png'}
          autoPlay
          muted
          loop
          playsInline
          aria-label={t('kit.hub.demo')}
        />
      </figure>
      <p className="kit-platforms-label">{t('kit.hub.platforms')}</p>
      {bands.map((b, i) => (
        <section className={'kit-band' + (i % 2 ? ' flip' : '')} key={b.id}>
          <figure className="kit-figure kit-figure-shot">
            <video
              src={REGISTRY_BASE + b.video}
              poster={REGISTRY_BASE + b.poster}
              autoPlay
              muted
              loop
              playsInline
              aria-label={t(b.alt)}
            />
          </figure>
          <div>
            <h2 className="kit-h2">{t(b.name)}</h2>
            <p className="kit-line kit-break">{t(b.line)}</p>
            <button type="button" className="btn btn-ghost" onClick={() => onOpen(b.id)}>{t('kit.hub.go')}</button>
          </div>
        </section>
      ))}
    </div>
  )
}

function KitSemanticPage({ onBack }) {
  const { t } = useLang()
  return (
    <div className="shell kit">
      <div className="page-head">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />{t('kit.backHub')}</button>
        <h1>{t('kit.semantic.name')}</h1>
      </div>
      <p className="page-sub kit-break">{t('kit.semantic.line')}</p>
      <KitShot src="kit/sem-explore.png" alt="kit.semantic.s1alt" title="kit.semantic.s1t" body="kit.semantic.s1b" />
      <KitShot src="kit/sem-decision.png" alt="kit.semantic.s2alt" title="kit.semantic.s2t" body="kit.semantic.s2b" flip />
      <KitShot src="kit/sem-io.png" alt="kit.semantic.s3alt" title="kit.semantic.s3t" body="kit.semantic.s3b" />
      <KitShot src="kit/sem-health.png" alt="kit.semantic.s4alt" title="kit.semantic.s4t" body="kit.semantic.s4b" flip />
      <KitShot src="kit/sem-bridge.png" alt="kit.semantic.s5alt" title="kit.semantic.s5t" body="kit.semantic.s5b" />
    </div>
  )
}

function KitAssistPage({ onBack }) {
  const { t } = useLang()
  return (
    <div className="shell kit">
      <div className="page-head">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />{t('kit.backHub')}</button>
        <h1>{t('kit.assist.name')}</h1>
      </div>
      <p className="page-sub kit-break">{t('kit.assist.line')}</p>
      <KitShot src="kit/shot-assist-compose.png" alt="kit.assist.s1alt" title="kit.assist.s1t" body="kit.assist.s1b" />
      <KitShot src="kit/shot-assist-card.png" alt="kit.assist.s2alt" title="kit.assist.s2t" body="kit.assist.s2b" flip />
      <KitShot src="kit/shot-assist-speak.png" alt="kit.assist.s3alt" title="kit.assist.s3t" body="kit.assist.s3b" />
    </div>
  )
}

function KitBizPage({ onBack }) {
  const { t } = useLang()
  return (
    <div className="shell kit">
      <div className="page-head">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={14} />{t('kit.backHub')}</button>
        <h1>{t('kit.biz.title')}</h1>
      </div>
      <p className="page-sub kit-break">{t('kit.biz.sub')}</p>
      <KitShot src="kit/biz-compose.jpg" alt="kit.biz.s1alt" title="kit.biz.s1t" body="kit.biz.s1b" />
      <KitShot src="kit/biz-send.jpg" alt="kit.biz.s2alt" title="kit.biz.s2t" body="kit.biz.s2b" flip />
      <KitShot src="kit/biz-inbox.png" alt="kit.biz.s3alt" title="kit.biz.s3t" body="kit.biz.s3b" />
      <KitShot src="kit/biz-draft.png" alt="kit.biz.s4alt" title="kit.biz.s4t" body="kit.biz.s4b" flip />
      <KitShot src="kit/biz-lookup.png" alt="kit.biz.s5alt" title="kit.biz.s5t" body="kit.biz.s5b" />
      <KitShot src="kit/biz-adopt.jpg" alt="kit.biz.s6alt" title="kit.biz.s6t" body="kit.biz.s6b" flip />
    </div>
  )
}

/* ── 上传页 ───────────────────────────────────────── */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/
const BUNDLE_SPEC_RE = /^(github:|git\+)[^\s"']+(#[^\s"']+)?$|^https:\/\/[^\s"']+\.(?:tgz|tar\.gz)(?:[?#][^\s"']*)?$|^@?[\w.-]+\/[\w.-]+$|^[\w@.-]+$/i
const PACK_SPEC_RE = /^https:\/\/[^\s"']+\.zip(?:[?#][^\s"']*)?$/i

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
    e.source = 'curated'
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
    const filename = (form.id || 'plugin') + '.json'
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
            <input value={form.spec} onChange={set('spec')} placeholder={form.type === 'bundle' ? '@ace-zone/example' : 'https://github.com/owner/repo/releases/download/tag/pkg.zip'} />
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
function viewFromHash() {
  const h = (typeof location !== 'undefined' && location.hash.slice(1)) || ''
  if (h === 'submit' || h === 'kit' || h === 'kit-semantic' || h === 'kit-assist' || h === 'kit-biz') return h
  return 'home'
}

export default function App() {
  const [view, setView] = useState(viewFromHash)
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
    ;(async () => {
      let list = []
      try {
        list = await loadRegistry()
        if (alive) { setItems(list); setStatus('ready') }
      } catch {
        if (alive) { setItems(DEMO_ITEMS); setStatus('demo') }
        return
      }
      try {
        const curated = await loadLiveCurated()
        if (alive && curated.length > 0) setItems(overlayCatalog(list, curated))
      } catch {}
    })()
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

  const catalogItems = useMemo(() => collapsePackageOwnerDuplicates(items, { preferCurated: true }), [items])

  const goTo = (next) => {
    setView(next)
    const hash = next === 'home' ? '' : '#' + next
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search)
    if (next !== 'home') window.scrollTo(0, 0)
  }
  const goSubmit = () => goTo('submit')
  const goHome = () => goTo('home')
  const goKit = () => goTo('kit')

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <LangCtx.Provider value={{ t, lang, setLang }}>
      <nav className="nav">
        <div className="nav-inner shell">
          <a className="brand" href="#top" onClick={goHome}>
            <span className="brand-mark"><WhaleMark size={18} /></span>
            DSH Plugin Market
          </a>
          <div className="nav-links">
            <button className="nav-link" onClick={() => { goHome(); setTimeout(() => document.getElementById('directory') && document.getElementById('directory').scrollIntoView(), 0) }}>{t('nav.directory')}</button>
            <button className={'nav-link nav-kit' + (String(view).startsWith('kit') ? ' on' : '')} onClick={goKit}>{t('nav.kit')}</button>
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
          <Home items={catalogItems} status={status} onGoSubmit={goSubmit} onOpenDetail={setDetail} onToast={showToast}
            onShowCopied={(payload) => setCopiedInfo(payload)} />
        ) : view === 'kit' ? (
          <KitHub onBack={goHome} onOpen={goTo} />
        ) : view === 'kit-semantic' ? (
          <KitSemanticPage onBack={goKit} />
        ) : view === 'kit-assist' ? (
          <KitAssistPage onBack={goKit} />
        ) : view === 'kit-biz' ? (
          <KitBizPage onBack={goKit} />
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
      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} onToast={showToast} onShowCopied={setCopiedInfo} />}
      {copiedInfo && (
        <CopiedModal info={copiedInfo} onClose={() => setCopiedInfo(null)} onOpenDetail={(it) => setDetail(it)} />
      )}
      {toast && <div className="toast"><Check size={14} />{toast}</div>}
    </LangCtx.Provider>
  )
}
