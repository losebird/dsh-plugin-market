// 把 registry 整个目录复制进 dist（含 examples 下的演示 zip），Pages 上以 /registry/** 提供
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'registry')
const DST = join(ROOT, 'dist', 'registry')

if (existsSync(SRC)) {
  mkdirSync(DST, { recursive: true })
  cpSync(SRC, DST, { recursive: true })
  console.log('[copy-registry] registry 已复制到 dist/registry')
}
