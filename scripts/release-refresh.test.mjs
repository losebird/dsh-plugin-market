import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEntry, detectInstallFromReadme } from './collect.mjs'

const repo = () => ({ full_name: 'author/example', githubId: 42, stars: 12, topicSourced: true, topics: ['dsh-plugin'], pushedAt: '2026-01-02T00:00:00Z' })
const previous = () => ({ id: 'example', repo: 'author/example', githubId: 42, package: 'example', version: 'v1.0.0', releasedAt: '2026-01-01T00:00:00Z', install: { method: 'dsh-plugin-add', source: 'readme' } })
async function withFetch(t, { missingReadme = false, releaseError = false } = {}, fn) {
  let releaseCalls = 0
  t.mock.method(globalThis, 'fetch', async url => {
    const path = String(url)
    if (path.endsWith('/package.json')) return Response.json({ name: 'example', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    if (path.endsWith('/README.md') || path.endsWith('/readme.md')) return missingReadme ? new Response('', { status: 404 }) : new Response('# Example\n## Installation\ndsh plugin --profile web add -w example\nUse the plugin to manage local files.')
    if (path.includes('/releases?')) { releaseCalls++; return releaseError ? new Response('', { status: 500 }) : Response.json([{ tag_name: 'v1.1.0', published_at: '2026-01-03T00:00:00Z', assets: [] }]) }
    throw new Error('Unexpected URL: ' + path)
  })
  await fn(() => releaseCalls)
}

test('an old cached version is refreshed and its check time recorded', async t => {
  await withFetch(t, {}, async calls => {
    const entry = await buildEntry(repo(), [previous()])
    assert.equal(entry.version, 'v1.1.0')
    assert.equal(entry.spec, 'github:author/example#v1.1.0')
    assert.ok(Number.isFinite(Date.parse(entry.releaseCheckedAt)))
    assert.equal(calls(), 1)
  })
})
test('recently checked unchanged repositories reuse release information', async t => {
  await withFetch(t, {}, async calls => {
    const entry = await buildEntry(repo(), [{ ...previous(), releaseCheckedAt: new Date().toISOString() }])
    assert.equal(entry.version, 'v1.0.0')
    assert.equal(calls(), 0)
  })
})
test('a new push invalidates recent release metadata', async t => {
  await withFetch(t, {}, async calls => {
    await buildEntry({ ...repo(), pushedAt: new Date().toISOString() }, [{ ...previous(), releaseCheckedAt: new Date(Date.now() - 1000).toISOString() }])
    assert.equal(calls(), 1)
  })
})
test('failed release lookup preserves the previous version without marking cache fresh', async t => {
  await withFetch(t, { releaseError: true }, async () => {
    const entry = await buildEntry(repo(), [previous()])
    assert.equal(entry.version, 'v1.0.0')
    assert.equal(entry.releaseCheckedAt, null)
  })
})
test('missing README can safely reuse the previous install classification', async t => {
  await withFetch(t, { missingReadme: true }, async () => {
    const entry = await buildEntry(repo(), [previous()])
    assert.deepEqual(entry.install, previous().install)
  })
})
test('a real workspace installation takes priority over a detailed guide link', () => {
  const text = '# Example\n## Installation\n```sh\ndsh plugin --profile web add -w https://example.com/example.tgz\n```\nSee INSTALL.md for configuration.'
  assert.deepEqual(detectInstallFromReadme(text), { method: 'dsh-plugin-add', source: 'readme' })
})
