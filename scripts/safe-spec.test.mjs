import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isMarketId, isNpmName, isTgzUrl, isPackUrl, isSafeBundleSpec,
  safeBundleSpec, canOneClick, tgzAssetUrl,
} from '../src/safe-spec.js'

test('isMarketId', () => {
  assert.equal(isMarketId('demo-hello'), true)
  assert.equal(isMarketId('dsh-plugin-market'), true)
  assert.equal(isMarketId(''), false)
  assert.equal(isMarketId('../etc/passwd'), false)
  assert.equal(isMarketId('Has Caps'), false)
})

test('isNpmName accepts scoped/unscoped and optional version', () => {
  assert.equal(isNpmName('@ace-zone/dsh-market'), true)
  assert.equal(isNpmName('@ace-zone/dsh-market@0.1.57'), true)
  assert.equal(isNpmName('dsh-better-sidebar'), true)
  assert.equal(isNpmName('dsh-better-sidebar@1.2.3'), true)
  assert.equal(isNpmName('github:owner/repo'), false)
  assert.equal(isNpmName('git+https://github.com/o/r'), false)
  assert.equal(isNpmName('https://example.com/x.tgz'), false)
  assert.equal(isNpmName('file:///tmp/x.tgz'), false)
  assert.equal(isNpmName('foo; rm -rf /'), false)
  assert.equal(isNpmName(''), false)
})

test('isTgzUrl / isPackUrl', () => {
  assert.equal(isTgzUrl('https://registry.npmjs.org/foo/-/foo-1.0.0.tgz'), true)
  assert.equal(isTgzUrl('https://github.com/o/r/releases/download/v1/pkg.tgz'), true)
  assert.equal(isTgzUrl('http://evil.test/x.tgz'), false)
  assert.equal(isTgzUrl('https://example.com/x.zip'), false)
  assert.equal(isPackUrl('https://www.dsh-plugin.shop/registry/examples/demo-hello/demo-hello.zip'), true)
  assert.equal(isPackUrl('http://example.com/x.zip'), false)
})

test('safeBundleSpec prefers npm/tgz and rejects git/unverified', () => {
  assert.equal(safeBundleSpec({ type: 'bundle', verified: true, spec: '@ace-zone/dsh-market' }), '@ace-zone/dsh-market')
  assert.equal(safeBundleSpec({ type: 'bundle', verified: true, spec: 'github:o/r#v1', package: 'dsh-foo' }), 'dsh-foo')
  assert.equal(safeBundleSpec({ type: 'bundle', verified: true, spec: 'https://x.test/a.tgz' }), 'https://x.test/a.tgz')
  assert.equal(safeBundleSpec({ type: 'bundle', verified: true, spec: 'github:o/r#v1' }), null)
  assert.equal(safeBundleSpec({ type: 'bundle', verified: false, spec: '@ace-zone/dsh-market' }), null)
  assert.equal(safeBundleSpec({ type: 'bundle', verified: true, status: 'unavailable', spec: 'dsh-foo' }), null)
  assert.equal(isSafeBundleSpec('github:o/r'), false)
})

test('canOneClick: pack https + verified npm/tgz only', () => {
  assert.equal(canOneClick({ type: 'pack', spec: 'https://example.com/a.zip' }), true)
  assert.equal(canOneClick({ type: 'bundle', verified: true, spec: '@scope/pkg' }), true)
  assert.equal(canOneClick({ type: 'bundle', verified: true, spec: 'github:o/r' }), false)
  assert.equal(canOneClick({ type: 'bundle', verified: false, spec: '@scope/pkg' }), false)
})

test('tgzAssetUrl', () => {
  assert.equal(tgzAssetUrl({
    assets: [
      { browser_download_url: 'https://example.com/notes.md' },
      { browser_download_url: 'https://example.com/pkg.tgz' },
    ],
  }), 'https://example.com/pkg.tgz')
  assert.equal(tgzAssetUrl({ assets: [] }), null)
})
