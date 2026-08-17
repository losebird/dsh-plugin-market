import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyOf, allKeysOf, applyGithubRepoDetail, pickBestPrev, keepHigherVersion,
  isAliasDiscovery, mergeCandidate, uniqueCandidates,
} from './canonicalize-repo.mjs'

const GH_ID = 1333111893

test('keyOf prefers github numeric id over repo string', () => {
  assert.equal(
    keyOf({ githubId: GH_ID, repo: 'ccch1mneyyy/dsh-cc-tui', package: '@deepseek-harness-tui/dsh-tui' }),
    'ghid:' + GH_ID,
  )
  assert.equal(
    keyOf({ repo: 'ccch1mneyyy/dsh-TUI', package: '@deepseek-harness-tui/dsh-tui' }),
    'repo:github.com/ccch1mneyyy/dsh-tui',
  )
})

test('keyOf is not package-first: different owners stay distinct', () => {
  const a = keyOf({ package: 'dsh-tui', repo: 'orriduck/dsh-tui' })
  const b = keyOf({ package: 'dsh-tui', repo: 'xiaoshihou514/dsh-tui' })
  assert.notEqual(a, b)
  assert.match(a, /^repo:/)
  assert.match(b, /^repo:/)
})

test('applyGithubRepoDetail writes canonical full_name and github id', () => {
  const repo = { full_name: 'ccch1mneyyy/dsh-cc-tui' }
  applyGithubRepoDetail(repo, {
    id: GH_ID,
    full_name: 'ccch1mneyyy/dsh-TUI',
    stargazers_count: 1625,
  })
  assert.equal(repo.full_name, 'ccch1mneyyy/dsh-TUI')
  assert.equal(repo.githubId, GH_ID)
  assert.equal(repo.discoveredAs, 'ccch1mneyyy/dsh-cc-tui')
  assert.ok(repo.aliases.includes('ccch1mneyyy/dsh-cc-tui'))
  assert.equal(isAliasDiscovery(repo), true)
})

test('mergeCandidate + uniqueCandidates: alias strings with the same github id become one', () => {
  const byRepo = new Map()
  mergeCandidate(byRepo, 'ccch1mneyyy/dsh-cc-tui', { id: GH_ID })
  mergeCandidate(byRepo, 'ccch1mneyyy/dsh-TUI', { id: GH_ID, topicSourced: true, stars: 1625 })
  mergeCandidate(byRepo, 'ccch1mneyyy/dsh-tui', { id: GH_ID })
  const list = uniqueCandidates(byRepo)
  assert.equal(list.length, 1)
  assert.equal(list[0].full_name, 'ccch1mneyyy/dsh-TUI')
  assert.equal(list[0].githubId, GH_ID)
  assert.equal(list[0].stars, 1625)
})

test('pickBestPrev keeps the newer tag across rename aliases', () => {
  const prevAuto = [
    { repo: 'ccch1mneyyy/dsh-TUI', package: '@deepseek-harness-tui/dsh-tui', version: 'v0.6.1' },
    { repo: 'ccch1mneyyy/dsh-cc-tui', package: '@deepseek-harness-tui/dsh-tui', version: 'v0.8.0' },
  ]
  const repo = { full_name: 'ccch1mneyyy/dsh-TUI', discoveredAs: 'ccch1mneyyy/dsh-cc-tui', githubId: GH_ID }
  const prev = pickBestPrev(repo, '@deepseek-harness-tui/dsh-tui', prevAuto)
  assert.ok(prev)
  assert.equal(prev.version, 'v0.8.0')
})

test('keepHigherVersion does not let a stale prev tag win over a newer fetch', () => {
  const kept = keepHigherVersion({ tag_name: 'v0.8.0', published_at: '2026-08-17T00:05:33Z' }, 'v0.6.1', '2026-08-17T03:13:00Z')
  assert.equal(kept.tag_name, 'v0.8.0')
})

test('allKeysOf records both github id and alias repo strings for seen', () => {
  const keys = allKeysOf({
    githubId: GH_ID,
    repo: 'ccch1mneyyy/dsh-TUI',
    discoveredAs: 'ccch1mneyyy/dsh-cc-tui',
  })
  assert.ok(keys.includes('ghid:' + GH_ID))
  assert.ok(keys.includes('repo:github.com/ccch1mneyyy/dsh-tui'))
  assert.ok(keys.includes('repo:github.com/ccch1mneyyy/dsh-cc-tui'))
})
