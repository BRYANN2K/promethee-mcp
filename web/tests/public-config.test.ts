import assert from 'node:assert/strict'
import test from 'node:test'

import { parsePublicConfig } from '../src/config/public-config.ts'

test('accepts a valid HTTPS Supabase URL and publishable key', () => {
  const result = parsePublicConfig({
    VITE_SUPABASE_URL: 'https://auth.promethee.io',
    VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(32)}`,
  })

  assert.deepEqual(result, {
    ok: true,
    value: {
      supabaseUrl: 'https://auth.promethee.io',
      supabasePublishableKey: `sb_publishable_${'a'.repeat(32)}`,
    },
  })
})

test('fails closed when browser configuration is absent', () => {
  assert.deepEqual(parsePublicConfig({}), {
    ok: false,
    reason: 'missing',
  })
})

test('rejects service-role and secret keys', () => {
  for (const key of ['service_role', 'sb_secret_example']) {
    assert.deepEqual(
      parsePublicConfig({
        VITE_SUPABASE_URL: 'https://auth.promethee.io',
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      }),
      { ok: false, reason: 'unsafe-key' },
    )
  }
})

test('rejects insecure and credential-bearing Supabase URLs', () => {
  for (const url of [
    'http://example.supabase.co',
    'https://user:pass@example.supabase.co',
    'javascript:alert(1)',
  ]) {
    assert.deepEqual(
      parsePublicConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(32)}`,
      }),
      { ok: false, reason: 'unsafe-url' },
    )
  }
})

test('rejects a different HTTPS Supabase origin', () => {
  assert.deepEqual(
    parsePublicConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(32)}`,
    }),
    { ok: false, reason: 'unsafe-url' },
  )
})
