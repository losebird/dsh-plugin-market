import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collapsePackageOwnerDuplicates,
  cardKey,
} from './collapse-package-owner.mjs'

test('same package + same owner: keep higher stars (renamed repo)', () => {
  const items = [
    {
      id: 'deepseek-harness-tui-dsh-tui',
      package: '@deepseek-harness-tui/dsh-tui',
      repo: 'ccch1mneyyy/dsh-cc-tui',
      version: 'v0.8.0',
      stars: 1625,
    },
    {
      id: 'deepseek-harness-tui-dsh-tui',
      package: '@deepseek-harness-tui/dsh-tui',
      repo: 'ccch1mneyyy/dsh-TUI',
      version: 'v0.6.1',
      stars: 1619,
    },
  ]
  const logs = []
  const result = collapsePackageOwnerDuplicates(items, { log: (m) => logs.push(m) })

  assert.equal(result.length, 1)
  assert.equal(result[0].repo, 'ccch1mneyyy/dsh-cc-tui')
  assert.equal(
    logs[0],
    '[collect] drop renamed duplicate ccch1mneyyy/dsh-TUI (same package @deepseek-harness-tui/dsh-tui as ccch1mneyyy/dsh-cc-tui)',
  )
})

test('same package name, different owners: do not merge', () => {
  const items = [
    { id: 'dsh-tui', package: 'dsh-tui', repo: 'orriduck/dsh-tui', stars: 3 },
    { id: 'dsh-tui', package: 'dsh-tui', repo: 'xiaoshihou514/dsh-tui', stars: 1 },
  ]
  const result = collapsePackageOwnerDuplicates(items)

  assert.equal(result.length, 2)
  assert.ok(result.some((it) => it.repo === 'orriduck/dsh-tui'))
  assert.ok(result.some((it) => it.repo === 'xiaoshihou514/dsh-tui'))
})

test('no package field: do not merge', () => {
  const items = [
    { id: 'a', repo: 'owner/repo-a', stars: 10 },
    { id: 'b', repo: 'owner/repo-b', stars: 5 },
  ]
  const result = collapsePackageOwnerDuplicates(items)

  assert.equal(result.length, 2)
})

test('preferCurated: curated row wins over auto with more stars', () => {
  const items = [
    {
      id: 'foo',
      package: '@scope/foo',
      repo: 'owner/foo',
      stars: 1,
      source: 'curated',
    },
    {
      id: 'foo',
      package: '@scope/foo',
      repo: 'owner/foo-renamed',
      stars: 999,
      source: 'auto',
    },
  ]
  const result = collapsePackageOwnerDuplicates(items, { preferCurated: true })

  assert.equal(result.length, 1)
  assert.equal(result[0].source, 'curated')
  assert.equal(result[0].repo, 'owner/foo')
})

test('cardKey prefers repo over id', () => {
  assert.equal(cardKey({ id: 'bare-id', repo: 'owner/the-repo' }), 'owner/the-repo')
  assert.equal(cardKey({ id: 'bare-id', package: '@scope/pkg' }), '@scope/pkg')
  assert.equal(cardKey({ id: 'bare-id' }), 'bare-id')
})
