#!/usr/bin/env node
// 快速将 curated 覆盖写入 registry/all.json（无 GitHub 采集，不改 auto.json）

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadCuratedItems, categorize, keyOf } from './collect.mjs'
import { allKeysOf } from './canonicalize-repo.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function applyCuratedDefaults(raw) {
  const item = { ...raw }
  item.category = categorize(item)
  if (!('source' in item)) item.source = 'curated'
  if (!('verified' in item)) item.verified = true
  if (!item.install) {
    if (item.type === 'pack') item.install = { method: 'pack' }
    else item.install = { method: 'dsh-plugin-add' }
  }
  return item
}

function overlayByKey(existing, curated) {
  const items = (existing || []).slice()
  const indexByKey = new Map()
  const remember = (it, i) => {
    indexByKey.set(keyOf(it), i)
    for (const k of allKeysOf(it)) indexByKey.set(k, i)
  }
  for (let i = 0; i < items.length; i++) remember(items[i], i)
  for (const raw of curated || []) {
    const item = applyCuratedDefaults(raw)
    let idx = -1
    for (const k of [keyOf(item), ...allKeysOf(item)]) {
      if (indexByKey.has(k)) { idx = indexByKey.get(k); break }
    }
    if (idx >= 0) {
      items[idx] = item
      remember(item, idx)
    } else {
      remember(item, items.length)
      items.push(item)
    }
  }
  return items
}

function loadAllItems(root) {
  const p = join(root, 'registry/all.json')
  if (!existsSync(p)) return []
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'))
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}

export function mergeCurated(root = ROOT) {
  const existing = loadAllItems(root)
  const curated = loadCuratedItems(root)
  const items = overlayByKey(existing, curated)
  items.sort((a, b) => (b.stars || 0) - (a.stars || 0))
  const out = { schemaVersion: 1, updatedAt: new Date().toISOString(), items }
  writeFileSync(join(root, 'registry/all.json'), JSON.stringify(out, null, 2) + '\n')
  return { curated: curated.length, merged: items.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { curated, merged } = mergeCurated()
  console.log('[merge-curated] curated=' + curated + ' merged=' + merged)
}
