import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConsentPath,
  buildLoginPath,
  isLoopbackDevelopment,
  readAuthorizationId,
  safeAuthorizationRedirect,
  safeProviderRedirect,
} from '../src/security/navigation.ts'

test('preserves a bounded opaque authorization identifier without rendering it', () => {
  const location = new URL(
    'https://auth.example.test/login?authorization_id=auth_0123456789abcdef',
  )
  const authorizationId = readAuthorizationId(location)

  assert.equal(authorizationId, 'auth_0123456789abcdef')
  assert.equal(
    buildConsentPath(authorizationId),
    '/oauth/consent?authorization_id=auth_0123456789abcdef',
  )
  assert.equal(buildLoginPath(authorizationId), '/login?authorization_id=auth_0123456789abcdef')
})

test('accepts only a provider redirect matching the registered destination', () => {
  assert.equal(
    safeAuthorizationRedirect(
      'https://client.example.test/callback?code=hidden&state=opaque',
      'https://client.example.test/callback',
    ),
    'https://client.example.test/callback?code=hidden&state=opaque',
  )
  for (const value of [
    'https://attacker.example/callback?code=hidden',
    'https://client.example.test/other?code=hidden',
    'javascript:alert(1)',
  ]) {
    assert.equal(safeAuthorizationRedirect(value, 'https://client.example.test/callback'), null)
  }
})

test('rejects malformed or oversized authorization identifiers', () => {
  for (const value of ['short', '<script>alert(1)</script>', 'a'.repeat(257)]) {
    const location = new URL('https://auth.example.test/login')
    location.searchParams.set('authorization_id', value)
    assert.equal(readAuthorizationId(location), null)
  }
})

test('permits a standalone identity probe only in a loopback development build', () => {
  assert.equal(isLoopbackDevelopment(true, new URL('http://127.0.0.1:4175/login')), true)
  assert.equal(isLoopbackDevelopment(true, new URL('http://localhost:4175/login')), true)
  assert.equal(isLoopbackDevelopment(false, new URL('http://127.0.0.1:4175/login')), false)
  assert.equal(isLoopbackDevelopment(true, new URL('https://auth.example.test/login')), false)
  assert.equal(isLoopbackDevelopment(true, new URL('http://192.0.2.10/login')), false)
})

test('allows provider-returned HTTPS, loopback HTTP, and native custom-scheme redirects', () => {
  assert.equal(
    safeProviderRedirect('https://client.example.test/callback?code=hidden'),
    'https://client.example.test/callback?code=hidden',
  )
  assert.equal(
    safeProviderRedirect('http://127.0.0.1:52731/callback?code=hidden'),
    'http://127.0.0.1:52731/callback?code=hidden',
  )
  assert.equal(
    safeProviderRedirect('my-client://oauth/callback?code=hidden'),
    'my-client://oauth/callback?code=hidden',
  )
})

test('rejects scriptable, local-file, credential-bearing, and remote HTTP redirects', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/token',
    'https://user:pass@client.example.test/callback',
    'http://client.example.test/callback',
  ]) {
    assert.equal(safeProviderRedirect(value), null)
  }
})
