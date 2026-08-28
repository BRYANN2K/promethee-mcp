import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyOtpVerificationError,
  isValidOtp,
  normalizeEmail,
  otpVerificationMessage,
  PERSONAL_CONNECTION_COPY,
} from '../src/routes/login.ts'

test('normalizes email before requesting a code', () => {
  assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com')
})

test('accepts exactly six ASCII digits as an email code', () => {
  assert.equal(isValidOtp('123456'), true)
  for (const value of ['12345', '1234567', '12 456', 'abcdef', '１２３４５６']) {
    assert.equal(isValidOtp(value), false)
  }
})

test('personal connection copy stays on one connection surface without an authorization review', () => {
  const copy = Object.values(PERSONAL_CONNECTION_COPY).join(' ')

  assert.match(copy, /Connect to Promethee/u)
  assert.match(copy, /7 days/u)
  assert.match(copy, /Never/u)
  assert.match(copy, /Connected/u)
  assert.doesNotMatch(copy, /review|approve|permissions|requesting client/iu)
})

test('classifies rejected and expired email codes without inspecting provider prose', () => {
  for (const code of ['otp_expired', 'invalid_credentials', 'validation_failed']) {
    assert.equal(classifyOtpVerificationError({ code }), 'invalid-or-expired')
  }
  assert.equal(classifyOtpVerificationError({ code: 'over_request_rate_limit' }), 'rate-limited')
  assert.equal(classifyOtpVerificationError({ code: 'request_timeout' }), 'unavailable')
  assert.equal(classifyOtpVerificationError(new Error('provider detail')), 'unavailable')
})

test('provides one actionable public message for every verification failure class', () => {
  assert.deepEqual(otpVerificationMessage('invalid-or-expired'), {
    field: 'This code is incorrect or has expired.',
    status: 'Enter the latest code or send a new one.',
  })
  assert.deepEqual(otpVerificationMessage('rate-limited'), {
    field: '',
    status: 'Too many attempts. Wait a moment, then send a new code.',
  })
  assert.deepEqual(otpVerificationMessage('unavailable'), {
    field: '',
    status: 'Promethee could not verify this code. Nothing was connected.',
  })
})
