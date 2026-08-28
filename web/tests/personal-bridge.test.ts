import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from '@supabase/supabase-js'

import {
  connectPersonalBridge,
  loadPersonalRetention,
  normalizePersonalBridgeUrl,
  resolvePersonalBridgeUrl,
} from '../src/auth/personal-bridge.ts'

test('accepts HTTPS production and explicit loopback development bridge origins', () => {
  assert.equal(normalizePersonalBridgeUrl('http://127.0.0.1:3210'), 'http://127.0.0.1:3210')
  assert.equal(normalizePersonalBridgeUrl('http://localhost:3210'), 'http://localhost:3210')
  assert.equal(normalizePersonalBridgeUrl('https://mcp.example.test'), 'https://mcp.example.test')
  for (const value of [
    'https://127.0.0.1:3210',
    'http://192.0.2.1:3210',
    'https://user:pass@mcp.example.test',
    'https://mcp.example.test/connect/session',
    'http://user:pass@127.0.0.1:3210',
    'javascript:alert(1)',
  ]) {
    assert.equal(normalizePersonalBridgeUrl(value), null)
  }
})

test('binds production pairing to the page origin and permits only same-origin packaged loopback', () => {
  assert.equal(
    resolvePersonalBridgeUrl('https://mcp.example.test', false, new URL('https://mcp.example.test/login')),
    'https://mcp.example.test',
  )
  assert.equal(
    resolvePersonalBridgeUrl('https://collector.example.test', false, new URL('https://mcp.example.test/login')),
    null,
  )
  assert.equal(
    resolvePersonalBridgeUrl('http://127.0.0.1:3210', false, new URL('https://mcp.example.test/login')),
    null,
  )
  assert.equal(
    resolvePersonalBridgeUrl('http://127.0.0.1:3210', true, new URL('http://127.0.0.1:4175/login')),
    'http://127.0.0.1:3210',
  )
  assert.equal(
    resolvePersonalBridgeUrl(undefined, true, new URL('http://localhost:4175/login')),
    'http://127.0.0.1:3210',
  )
  assert.equal(
    resolvePersonalBridgeUrl(undefined, false, new URL('https://mcp.example.test/login')),
    null,
  )
  assert.equal(
    resolvePersonalBridgeUrl(undefined, false, new URL('http://127.0.0.1:3247/login')),
    'http://127.0.0.1:3247',
  )
  assert.equal(
    resolvePersonalBridgeUrl('http://127.0.0.1:3247', false, new URL('http://127.0.0.1:3247/login')),
    'http://127.0.0.1:3247',
  )
  assert.equal(
    resolvePersonalBridgeUrl('http://127.0.0.1:3210', false, new URL('http://127.0.0.1:3247/login')),
    null,
  )
})

test('loads only an exact server-owned retention value', async () => {
  const requests: string[] = []
  const loaded = await loadPersonalRetention('https://mcp.example.test', async (input, init) => {
    requests.push(`${init?.method ?? 'GET'} ${String(input)}`)
    return Response.json({ mode: 'seven-days', retainedUntil: 1_788_552_000_000 })
  })
  assert.equal(loaded, 'seven-days')
  assert.deepEqual(requests, ['GET https://mcp.example.test/connect/settings'])

  const rejected = await loadPersonalRetention(
    'https://mcp.example.test',
    async () => Response.json({ mode: 'forever' }),
  )
  assert.equal(rejected, null)
})

test('saves retention before pairing without sending identity fields', async () => {
  const captured: Array<{ input: string; init: RequestInit | undefined }> = []
  const session = {
    access_token: 'synthetic.user.access-token',
    refresh_token: 'synthetic-refresh-token-value',
    expires_at: 1_787_950_800,
  } as Session
  const connected = await connectPersonalBridge(
    {
      baseUrl: 'http://127.0.0.1:3210',
      supabaseUrl: 'https://auth.promethee.io',
      supabasePublishableKey: 'sb_publishable_synthetic_test_key',
    },
    session,
    'seven-days',
    async (input, init) => {
      captured.push({ input: String(input), init })
      return captured.length === 1
        ? Response.json({ mode: 'seven-days', retainedUntil: 1_788_552_000_000 })
        : Response.json({ connected: true })
    },
  )
  assert.deepEqual(connected, { ok: true, retention: 'seven-days' })
  assert.equal(captured.length, 2)
  assert.equal(captured[0]?.input, 'http://127.0.0.1:3210/connect/settings')
  assert.equal(captured[0]?.init?.method, 'PUT')
  assert.deepEqual(JSON.parse(String(captured[0]?.init?.body)), { mode: 'seven-days' })
  assert.equal(captured[1]?.input, 'http://127.0.0.1:3210/connect/session')
  assert.equal(captured[1]?.init?.method, 'POST')
  const payload = JSON.parse(String(captured[1]?.init?.body)) as Record<string, unknown>
  assert.equal(payload['accessToken'], session.access_token)
  assert.equal(payload['refreshToken'], session.refresh_token)
  assert.equal('email' in payload, false)
  assert.equal('userId' in payload, false)
})

test('a failed retention save prevents session pairing', async () => {
  let requests = 0
  const result = await connectPersonalBridge(
    {
      baseUrl: 'https://mcp.example.test',
      supabaseUrl: 'https://auth.promethee.io',
      supabasePublishableKey: 'sb_publishable_synthetic_test_key',
    },
    {
      access_token: 'synthetic.user.access-token',
      refresh_token: 'synthetic-refresh-token-value',
      expires_at: 1_787_950_800,
    } as Session,
    'memory',
    async () => {
      requests += 1
      return Response.json({ error: 'persistence_unavailable' }, { status: 409 })
    },
  )

  assert.deepEqual(result, { ok: false, failure: 'settings' })
  assert.equal(requests, 1)
})

test('bounds an unresponsive bridge and returns the owning failure state', async () => {
  const neverRespond = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('synthetic_abort')), { once: true })
    })

  assert.equal(
    await loadPersonalRetention('https://mcp.example.test', neverRespond, 1),
    null,
  )

  const result = await connectPersonalBridge(
    {
      baseUrl: 'https://mcp.example.test',
      supabaseUrl: 'https://auth.promethee.io',
      supabasePublishableKey: 'sb_publishable_synthetic_test_key',
      requestTimeoutMs: 1,
    },
    {
      access_token: 'synthetic.user.access-token',
      refresh_token: 'synthetic-refresh-token-value',
      expires_at: 1_787_950_800,
    } as Session,
    'memory',
    neverRespond,
  )
  assert.deepEqual(result, { ok: false, failure: 'settings' })

  const stalledBody = async (): Promise<Response> =>
    new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
      headers: { 'Content-Type': 'application/json' },
    })
  assert.equal(
    await loadPersonalRetention('https://mcp.example.test', stalledBody, 1),
    null,
  )
})
