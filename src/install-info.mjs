// Shared install *presentation* for the official site and the in-app DSH market.
// Display / copy only. Does not execute anything.
//
// Kinds: plugin | pack | app | companion | none
// Never copy github: specs, README scrapes (curl|sh, irm|iex, npm -g, git clone),
// or a fake `dsh plugin add` of a zip / standalone app.

const PLUGIN_ADD = 'dsh plugin --profile web add '

const KNOWN_STANDALONE = new Set([
  '@deepseek-harness-tui/dsh-tui',
  'deepseek-harness-tui-dsh-tui',
  '@deepseek-ai/dsh-tui',
  '@dsh-tui/dsh-tui',
  'dsh-tui',
  'oh-dsh-desktop',
  'deepseek-harness-desktop',
])

const FOREIGN_NPM_GLOBAL = new Set([
  '@deepseek-ai/dsh',
  '@anthropic-ai/claude-code',
])

const COMPANION_KEYS = [
  'companionPackage',
  'companionSpec',
  'pluginPackage',
  'pluginSpec',
]

function str(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function lower(v) {
  return str(v).toLowerCase()
}

function lastSeg(v) {
  const s = str(v)
  if (!s) return ''
  if (s.startsWith('@') && s.includes('/')) return s.slice(s.lastIndexOf('/') + 1)
  return s
}

export function isKitchenCommand(text) {
  const s = String(text || '')
  if (!s) return false
  if (/curl\b[\s\S]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i.test(s)) return true
  if (/\birm\b[\s\S]*\|\s*iex\b/i.test(s)) return true
  if (/\bnpm\s+(?:install|i)\s+(?:-g|--global)\b/i.test(s)) return true
  if (/\bgit\s+clone\b/i.test(s)) return true
  if (/仓库到/.test(s)) return true
  return false
}

export function isGithubSpec(value) {
  const s = str(value)
  return /^(github:|git\+)/i.test(s)
}

export function isTgzUrl(value) {
  const s = str(value)
  return /^https:\/\/\S+\.(?:tgz|tar\.gz)(?:[?#]\S*)?$/i.test(s)
}

export function isZipUrl(value) {
  const s = str(value)
  return /^https:\/\/\S+\.zip(?:[?#]\S*)?$/i.test(s)
}

// Published npm name: scoped (@scope/name) or unscoped (dsh-better-sidebar).
// Reject GitHub slugs used as package (Owner/repo, no @).
export function isNpmName(value) {
  const s = str(value)
  if (!s || /\s/.test(s)) return false
  if (isGithubSpec(s) || /^https?:/i.test(s)) return false
  if (isKitchenCommand(s)) return false
  if (s.startsWith('@')) return /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(s)
  if (s.includes('/')) return false
  return /^[a-z0-9][a-z0-9._-]*$/i.test(s)
}

export function asPluginAddSpec(value) {
  const s = str(value)
  if (!s || isKitchenCommand(s) || isGithubSpec(s)) return null
  if (isTgzUrl(s) || isNpmName(s)) return s
  return null
}

export function pluginAddCommand(spec) {
  const addSpec = asPluginAddSpec(spec)
  return addSpec ? PLUGIN_ADD + addSpec : ''
}

export function pluginAddSpec(item) {
  if (!item || typeof item !== 'object') return null
  return asPluginAddSpec(item.package) || asPluginAddSpec(item.spec)
}

function methodOf(item) {
  return item && item.install && typeof item.install.method === 'string'
    ? item.install.method
    : ''
}

function isPack(item) {
  if (!item) return false
  if (item.type === 'pack') return true
  if (methodOf(item) === 'pack') return true
  return false
}

function npmGlobalTarget(item) {
  const cmd = item && item.install ? str(item.install.command) : ''
  const m = /\bnpm\s+(?:install|i)\s+(?:-g|--global)\s+(\S+)/i.exec(cmd)
  return m ? m[1].replace(/[;'"`]+$/, '') : ''
}

function identitySet(item) {
  return new Set([item.id, item.name, item.package].map(lower).filter(Boolean))
}

function isKnownStandalone(item) {
  for (const key of identitySet(item)) {
    if (KNOWN_STANDALONE.has(key)) return true
  }
  return false
}

function hasStandaloneSuffix(item) {
  for (const raw of [item.id, item.name, item.package]) {
    const seg = lastSeg(raw).toLowerCase()
    if (!seg) continue
    if (seg === 'dsh-tui') return true
    if (/-(desktop|launcher|tui)$/.test(seg)) return true
  }
  return false
}

function isWebPlugin(item) {
  return methodOf(item) === 'dsh-plugin-add' && !!pluginAddSpec(item) && item.verified !== false
}

function installsForeignNpmGlobal(item) {
  if (methodOf(item) !== 'npm-global') return false
  const target = npmGlobalTarget(item)
  if (!target) return true
  if (FOREIGN_NPM_GLOBAL.has(target)) return true
  const self = identitySet(item)
  if (self.has(lower(target))) return false
  return true
}

function isApp(item) {
  const method = methodOf(item)
  if (method === 'desktop' || method === 'script') return true
  if (isKnownStandalone(item)) return true
  if (installsForeignNpmGlobal(item)) return true
  if (hasStandaloneSuffix(item) && !isWebPlugin(item)) return true
  return false
}

function companionAddSpec(item) {
  if (!item || typeof item !== 'object') return null
  const bag = [item, item.install, item.companion]
  for (const obj of bag) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    for (const key of COMPANION_KEYS) {
      const spec = asPluginAddSpec(obj[key])
      if (spec) return spec
    }
  }
  if (typeof item.companion === 'string') return asPluginAddSpec(item.companion)
  return null
}

export function officialDownloadUrl(item) {
  if (!item || typeof item !== 'object') return null
  const home = str(item.homepage)
  if (/^https:\/\//i.test(home)) return home
  const repo = str(item.repo)
  if (/^[^/\s]+\/[^/\s]+$/.test(repo)) return 'https://github.com/' + repo + '/releases'
  const authorUrl = item.author && str(item.author.url)
  if (/^https:\/\//i.test(authorUrl)) return authorUrl
  return null
}

export function packZipUrl(item) {
  if (!item) return null
  const spec = str(item.spec)
  if (isZipUrl(spec)) return spec
  if (item.type === 'pack' && /^https:\/\//i.test(spec)) return spec
  return null
}

function empty(kind, extra) {
  return Object.assign({ kind, command: null, addSpec: null, downloadUrl: null }, extra)
}

export function installPresentation(item) {
  if (!item || typeof item !== 'object') return empty('none')

  if (isPack(item)) {
    return empty('pack', { downloadUrl: packZipUrl(item) })
  }

  const companion = companionAddSpec(item)
  if (companion && isApp(item)) {
    return {
      kind: 'companion',
      command: PLUGIN_ADD + companion,
      addSpec: companion,
      downloadUrl: officialDownloadUrl(item),
    }
  }

  if (isApp(item)) {
    return empty('app', { downloadUrl: officialDownloadUrl(item) })
  }

  const addSpec = pluginAddSpec(item)
  if (addSpec && item.verified !== false) {
    return {
      kind: 'plugin',
      command: PLUGIN_ADD + addSpec,
      addSpec,
      downloadUrl: null,
    }
  }

  return empty('none')
}

export function installCommand(item) {
  return installPresentation(item).command || ''
}

// Site / modal helper: only a finished plugin (or companion) command, never OS kitchen scripts.
export function installCommands(item) {
  const cmd = installCommand(item)
  return cmd ? { any: cmd } : {}
}

export const INSTALL_COPY = {
  zh: {
    packNote: '下载 zip 后解压：skill 放到 ~/.agents/skills/，preset 放到 ~/.dsh/.agent-presets/。',
    unverNote: '未验证（仓库没声明能挂上的插件）。没有一键安装，请到仓库看作者说明。',
    appNote: '这是独立产品。请打开官方下载页面；不要在终端执行采集到的脚本。',
    packDownload: '下载扩展包 zip',
    officialDownload: '官方下载',
  },
  en: {
    packNote: 'Download the zip and unpack — skills to ~/.agents/skills/, presets to ~/.dsh/.agent-presets/.',
    unverNote: 'Unverified (the repo does not declare a mountable plugin). No one-click install; see the author\'s notes in the repo.',
    appNote: 'This is a standalone product. Open the official download page; do not run scraped scripts in a terminal.',
    packDownload: 'Download pack zip',
    officialDownload: 'Official download',
  },
}
