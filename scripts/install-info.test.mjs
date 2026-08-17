import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  installPresentation,
  installCommand,
  installCommands,
  isKitchenCommand,
} from '../src/install-info.mjs'

function assertNoKitchen(info) {
  const blob = JSON.stringify(info)
  assert.equal(isKitchenCommand(info.command || ''), false)
  assert.doesNotMatch(blob, /git clone --branch/)
  assert.doesNotMatch(blob, /git clone 仓库到/)
  assert.doesNotMatch(String(info.command || ''), /github:/i)
  assert.doesNotMatch(String(info.command || ''), /curl\b/i)
  assert.doesNotMatch(String(info.command || ''), /npm install -g/)
  assert.doesNotMatch(String(info.command || ''), /git clone/)
}

test('dsh-better-sidebar git-clone + package → plugin add package, not git clone', () => {
  const item = {
    id: 'dsh-better-sidebar',
    name: 'dsh-better-sidebar',
    type: 'bundle',
    package: 'dsh-better-sidebar',
    repo: 'omdsh-dev/DSH-better-sidebar',
    spec: 'github:omdsh-dev/DSH-better-sidebar#v0.12.2',
    verified: true,
    install: {
      method: 'git-clone',
      source: 'readme',
      command: 'git clone https://github.com/omdsh-dev/DSH-better-sidebar.git',
    },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.addSpec, 'dsh-better-sidebar')
  assert.equal(info.command, 'dsh plugin --profile web add dsh-better-sidebar')
  assert.equal(installCommand(item), 'dsh plugin --profile web add dsh-better-sidebar')
  assert.deepEqual(installCommands(item), { any: 'dsh plugin --profile web add dsh-better-sidebar' })
  assertNoKitchen(info)
})

test('dsh-tui npm-global of @deepseek-ai/dsh → app, no web add command', () => {
  const item = {
    id: 'deepseek-harness-tui-dsh-tui',
    name: '@deepseek-harness-tui/dsh-tui',
    type: 'bundle',
    package: '@deepseek-harness-tui/dsh-tui',
    repo: 'ccch1mneyyy/dsh-TUI',
    spec: 'github:ccch1mneyyy/dsh-TUI#v0.6.1',
    verified: true,
    install: {
      method: 'npm-global',
      source: 'readme',
      command: 'npm install -g @deepseek-ai/dsh',
    },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'app')
  assert.equal(info.command, null)
  assert.equal(installCommand(item), '')
  assert.deepEqual(installCommands(item), {})
  assert.equal(info.downloadUrl, 'https://github.com/ccch1mneyyy/dsh-TUI/releases')
  assertNoKitchen(info)
})

test('open-design script curl|sh → app, no curl copied', () => {
  const item = {
    id: 'open-design',
    name: 'open-design',
    type: 'bundle',
    package: 'open-design',
    repo: 'nexu-io/open-design',
    spec: 'github:nexu-io/open-design#open-design-v0.19.2',
    verified: false,
    homepage: 'https://open-design.ai/',
    install: {
      method: 'script',
      source: 'readme',
      scriptUrl: 'https://open-design.ai/install.sh',
      os: {
        darwin: 'curl -fsSL https://open-design.ai/install.sh | sh',
        linux: 'curl -fsSL https://open-design.ai/install.sh | sh',
      },
    },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'app')
  assert.equal(info.command, null)
  assert.equal(installCommand(item), '')
  assert.equal(info.downloadUrl, 'https://open-design.ai/')
  assertNoKitchen(info)
})

test('handmade github: spec, package missing → none (do not copy github:)', () => {
  const item = {
    id: 'dsh-import-agents',
    name: 'dsh-import-agents',
    type: 'bundle',
    repo: 'Chang-Tong/dsh-import-agents',
    spec: 'github:Chang-Tong/dsh-import-agents',
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'none')
  assert.equal(info.command, null)
  assert.equal(installCommand(item), '')
  assertNoKitchen(info)
})

test('handmade with package npm name → plugin add that name', () => {
  const item = {
    id: 'dsh-import-agents',
    name: 'dsh-import-agents',
    type: 'bundle',
    repo: 'Chang-Tong/dsh-import-agents',
    spec: 'github:Chang-Tong/dsh-import-agents',
    package: 'dsh-import-agents',
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.command, 'dsh plugin --profile web add dsh-import-agents')
  assertNoKitchen(info)
})

test('handmade with spec npm → plugin add that spec', () => {
  const item = {
    id: 'dsh-import-agents',
    name: 'dsh-import-agents',
    type: 'bundle',
    repo: 'Chang-Tong/dsh-import-agents',
    spec: 'dsh-import-agents',
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.command, 'dsh plugin --profile web add dsh-import-agents')
  assertNoKitchen(info)
})

test('github slug used as package is not an npm name → none', () => {
  const item = {
    id: 'dsh-import-agents',
    name: 'dsh-import-agents',
    type: 'bundle',
    repo: 'Chang-Tong/dsh-import-agents',
    spec: 'github:Chang-Tong/dsh-import-agents',
    package: 'Chang-Tong/dsh-import-agents',
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'none')
  assert.equal(info.command, null)
  assertNoKitchen(info)
})

test('pack 世舶 zip → pack, no dsh plugin add', () => {
  const item = {
    id: 'baobiao-api-overview',
    name: '世舶科技招投标数据 Skills',
    type: 'pack',
    repo: 'Tingman/baobiao-api-skills',
    spec: 'https://github.com/Tingman/baobiao-api-skills/releases/download/v1.0.1/baobiao-api-overview-v1.0.1.zip',
    install: { method: 'pack' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'pack')
  assert.equal(info.command, null)
  assert.equal(installCommand(item), '')
  assert.equal(
    info.downloadUrl,
    'https://github.com/Tingman/baobiao-api-skills/releases/download/v1.0.1/baobiao-api-overview-v1.0.1.zip',
  )
  assert.doesNotMatch(JSON.stringify(info), /dsh plugin --profile web add/)
  assertNoKitchen(info)
})

test('verified dsh-plugin-add + scoped package → plugin add package (not github: spec)', () => {
  const item = {
    id: 'anionex-dsh-vision-toolkit',
    name: '@anionex/dsh-vision-toolkit',
    type: 'bundle',
    package: '@anionex/dsh-vision-toolkit',
    repo: 'Anionex/dsh-vision-toolkit',
    spec: 'github:Anionex/dsh-vision-toolkit#v0.1.7',
    verified: true,
    install: { method: 'dsh-plugin-add', source: 'readme' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.addSpec, '@anionex/dsh-vision-toolkit')
  assert.equal(info.command, 'dsh plugin --profile web add @anionex/dsh-vision-toolkit')
  assertNoKitchen(info)
})

test('verified dsh-plugin-add with npm spec uses that spec', () => {
  const item = {
    id: 'anionex-dsh-vision-toolkit',
    name: '@anionex/dsh-vision-toolkit',
    type: 'bundle',
    package: '@anionex/dsh-vision-toolkit',
    spec: '@anionex/dsh-vision-toolkit',
    verified: true,
    install: { method: 'dsh-plugin-add' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.command, 'dsh plugin --profile web add @anionex/dsh-vision-toolkit')
})

test('https tgz spec is a valid plugin add target', () => {
  const item = {
    id: 'foo',
    type: 'bundle',
    spec: 'https://example.com/foo-1.0.0.tgz',
    verified: true,
    install: { method: 'dsh-plugin-add' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'plugin')
  assert.equal(info.command, 'dsh plugin --profile web add https://example.com/foo-1.0.0.tgz')
})

test('truncated git clone --branch / 仓库到 never appear as copyable command', () => {
  const item = {
    id: 'junk',
    name: 'junk',
    type: 'bundle',
    spec: 'github:owner/junk',
    verified: true,
    install: {
      method: 'git-clone',
      command: 'git clone --branch 仓库到',
    },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'none')
  assert.equal(info.command, null)
  assertNoKitchen(info)
  assert.equal(isKitchenCommand('git clone --branch'), true)
  assert.equal(isKitchenCommand('git clone 仓库到 /tmp/x'), true)
})

test('unverified bundle with only github: spec → none', () => {
  const item = {
    id: 'unknown-plugin',
    type: 'bundle',
    spec: 'github:someone/unknown-plugin',
    verified: false,
    install: { method: 'manual' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'none')
  assert.equal(info.command, null)
})

test('desktop method → app even with an npm-looking package', () => {
  const item = {
    id: 'oh-dsh-desktop',
    name: 'oh-dsh-desktop',
    type: 'bundle',
    package: 'oh-dsh-desktop',
    repo: 'hust-open-atom-club/oh-dsh-desktop',
    spec: 'github:hust-open-atom-club/oh-dsh-desktop#v0.1.6',
    verified: true,
    install: { method: 'desktop' },
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'app')
  assert.equal(info.command, null)
  assert.equal(info.downloadUrl, 'https://github.com/hust-open-atom-club/oh-dsh-desktop/releases')
})

test('companion field on an app row copies the sibling plugin, not curl', () => {
  const item = {
    id: 'open-design',
    type: 'bundle',
    package: 'open-design',
    repo: 'nexu-io/open-design',
    verified: false,
    install: {
      method: 'script',
      os: { darwin: 'curl -fsSL https://open-design.ai/install.sh | sh' },
    },
    companionPackage: '@acme/open-design-dsh',
  }
  const info = installPresentation(item)
  assert.equal(info.kind, 'companion')
  assert.equal(info.command, 'dsh plugin --profile web add @acme/open-design-dsh')
  assertNoKitchen(info)
})

test('do not invent a companion spec when fields are missing', () => {
  const item = {
    id: 'open-design',
    type: 'bundle',
    package: 'open-design',
    repo: 'nexu-io/open-design',
    install: { method: 'script', os: { linux: 'curl -fsSL https://x | sh' } },
  }
  assert.equal(installPresentation(item).kind, 'app')
})
