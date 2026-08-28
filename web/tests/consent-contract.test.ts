import assert from 'node:assert/strict'
import test from 'node:test'

import { parseRequestedScopes } from '../src/routes/consent.ts'

test('accepts the bounded identity, read, and create scope contract', () => {
  assert.deepEqual(
    parseRequestedScopes('openid email tasks:read projects:read tasks:write projects:write'),
    ['openid', 'email', 'tasks:read', 'projects:read', 'tasks:write', 'projects:write'],
  )
})

test('rejects duplicate, unknown, empty, and oversized scope requests', () => {
  assert.equal(parseRequestedScopes('tasks:read tasks:read'), null)
  assert.equal(parseRequestedScopes('tasks:delete'), null)
  assert.equal(parseRequestedScopes(''), null)
  assert.equal(parseRequestedScopes(`openid ${'x'.repeat(513)}`), null)
})
