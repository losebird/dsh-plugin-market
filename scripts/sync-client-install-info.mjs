import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientPath = join(root, 'src/client.js')
const installInfo = readFileSync(join(root, 'src/install-info.mjs'), 'utf8')
const client = readFileSync(clientPath, 'utf8')

const START = '// Shared install *presentation*'
const END = 'window.__ModuleLoader__.load'
const start = client.indexOf(START)
const end = client.indexOf(END)
if (start < 0 || end <= start) throw new Error('sync markers not found in src/client.js')

const stripped = installInfo.replace(/^export /gm, '')
writeFileSync(clientPath, client.slice(0, start) + stripped.trimEnd() + '\n\n' + client.slice(end))
