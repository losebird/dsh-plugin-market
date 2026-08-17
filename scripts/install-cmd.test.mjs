import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installCmdFor, installCommands, installCommand } from '../src/install-cmd.mjs'

const BAD_CMD = /curl\s|irm\s|npm install -g|git clone/

function expectBundleCmd(item, spec) {
  const expected = `dsh plugin --profile web add ${spec}`
  assert.equal(installCmdFor(item), expected)
  assert.equal(installCommand(item), expected)
  assert.deepEqual(installCommands(item), { any: expected })
  assert.ok(!BAD_CMD.test(expected))
}

test('script-method bundle with curl|sh and irm|iex still copies dsh plugin add spec', () => {
  const item = {
    type: 'bundle',
    spec: 'github:nexu-io/open-design#open-design-v0.19.2',
    install: {
      method: 'script',
      os: {
        darwin: 'curl -fsSL https://open-design.ai/install.sh | sh',
        linux: 'curl -fsSL https://open-design.ai/install.sh | sh',
        win32: 'irm https://open-design.ai/install.ps1 | iex',
      },
    },
  }
  expectBundleCmd(item, 'github:nexu-io/open-design#open-design-v0.19.2')
})

test('npm-global bundle still copies dsh plugin add spec', () => {
  const item = {
    type: 'bundle',
    spec: 'github:ccch1mneyyy/dsh-TUI#v0.6.1',
    install: {
      method: 'npm-global',
      command: 'npm install -g @deepseek-ai/dsh',
    },
  }
  expectBundleCmd(item, 'github:ccch1mneyyy/dsh-TUI#v0.6.1')
})

test('git-clone bundle still copies dsh plugin add spec, not truncated git clone', () => {
  const item = {
    type: 'bundle',
    spec: 'github:omdsh-dev/DSH-better-sidebar#v0.12.2',
    install: {
      method: 'git-clone',
      command: 'git clone https://github.com/omdsh-dev/DSH-better-sidebar.git',
    },
  }
  const cmd = installCmdFor(item)
  expectBundleCmd(item, 'github:omdsh-dev/DSH-better-sidebar#v0.12.2')
  assert.ok(!cmd.includes('git clone --branch'))
  assert.ok(!cmd.includes('git clone 仓库到'))
})

test('handmade bundle without install field copies dsh plugin add spec with version pin', () => {
  const item = {
    type: 'bundle',
    spec: 'github:WenhongPan/dsh-projects#v0.2.0-alpha.2',
  }
  expectBundleCmd(item, 'github:WenhongPan/dsh-projects#v0.2.0-alpha.2')
})

test('pack does not copy fake dsh plugin add of zip URL', () => {
  const item = {
    type: 'pack',
    spec: 'https://www.dsh-plugin.shop/registry/examples/demo-hello/demo-hello.zip',
    install: { method: 'pack' },
  }
  assert.equal(installCmdFor(item), '')
  assert.equal(installCommand(item), '')
  assert.deepEqual(installCommands(item), {})
  const all = JSON.stringify({ cmd: installCmdFor(item), cmds: installCommands(item) })
  assert.ok(!all.includes('dsh plugin'))
  assert.ok(!all.includes('demo-hello.zip'))
})

test('bundle with empty or missing spec returns empty', () => {
  assert.equal(installCmdFor({ type: 'bundle', spec: '' }), '')
  assert.equal(installCmdFor({ type: 'bundle' }), '')
  assert.deepEqual(installCommands({ type: 'bundle', spec: '' }), {})
})

test('installCommands for script-method bundle has only any key', () => {
  const item = {
    type: 'bundle',
    spec: 'github:nexu-io/open-design#open-design-v0.19.2',
    install: {
      method: 'script',
      os: {
        darwin: 'curl -fsSL https://open-design.ai/install.sh | sh',
        linux: 'curl -fsSL https://open-design.ai/install.sh | sh',
        win32: 'irm https://open-design.ai/install.ps1 | iex',
      },
    },
  }
  const cmds = installCommands(item)
  assert.deepEqual(cmds, {
    any: 'dsh plugin --profile web add github:nexu-io/open-design#open-design-v0.19.2',
  })
  assert.ok(!('darwin' in cmds))
  assert.ok(!('linux' in cmds))
  assert.ok(!('win32' in cmds))
})

test('returned commands never include README-scraped install patterns', () => {
  const items = [
    {
      type: 'bundle',
      spec: 'github:nexu-io/open-design#open-design-v0.19.2',
      install: {
        method: 'script',
        os: {
          darwin: 'curl -fsSL https://open-design.ai/install.sh | sh',
          linux: 'curl -fsSL https://open-design.ai/install.sh | sh',
          win32: 'irm https://open-design.ai/install.ps1 | iex',
        },
      },
    },
    {
      type: 'bundle',
      spec: 'github:ccch1mneyyy/dsh-TUI#v0.6.1',
      install: { method: 'npm-global', command: 'npm install -g @deepseek-ai/dsh' },
    },
    {
      type: 'bundle',
      spec: 'github:omdsh-dev/DSH-better-sidebar#v0.12.2',
      install: {
        method: 'git-clone',
        command: 'git clone https://github.com/omdsh-dev/DSH-better-sidebar.git',
      },
    },
  ]
  for (const item of items) {
    const cmd = installCmdFor(item)
    assert.ok(!BAD_CMD.test(cmd), `unexpected README pattern in: ${cmd}`)
    const any = installCommands(item).any
    if (any) assert.ok(!BAD_CMD.test(any), `unexpected README pattern in: ${any}`)
  }
})
