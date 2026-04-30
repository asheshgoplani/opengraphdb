// QA bug #4 regression (2026-04-30): the backend returns
// `{"error": "query error: ..."}` on 4xx/5xx but the pre-fix client only
// read `body.message`, dropping the real reason and showing "Bad Request"
// to users. These tests pin the new contract via the pure
// `extractErrorMessage` helper that ApiClient.request delegates to.
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractErrorMessage } from './error-message.js'

test('extractErrorMessage prefers body.error over statusText (QA bug #4)', () => {
  const message = extractErrorMessage(
    { error: 'query error: semantic analysis error: unbound variable: cnt' },
    'Bad Request',
  )
  assert.equal(
    message,
    'query error: semantic analysis error: unbound variable: cnt',
    'must surface body.error, not statusText',
  )
})

test('extractErrorMessage prefers body.error over body.message when both present', () => {
  const message = extractErrorMessage(
    { error: 'real reason', message: 'legacy reason' },
    'Bad Request',
  )
  assert.equal(message, 'real reason')
})

test('extractErrorMessage falls back to body.message when body.error absent', () => {
  const message = extractErrorMessage(
    { message: 'legacy: pipeline crashed' },
    'Internal Server Error',
  )
  assert.equal(message, 'legacy: pipeline crashed')
})

test('extractErrorMessage falls back to statusText for empty body fields', () => {
  assert.equal(extractErrorMessage({}, 'Service Unavailable'), 'Service Unavailable')
  assert.equal(extractErrorMessage({ error: '' }, 'Bad Gateway'), 'Bad Gateway')
  assert.equal(
    extractErrorMessage({ unrelated: 'value' }, 'Forbidden'),
    'Forbidden',
  )
})

test('extractErrorMessage tolerates non-object / null bodies', () => {
  assert.equal(extractErrorMessage(null, 'Bad Gateway'), 'Bad Gateway')
  assert.equal(extractErrorMessage('plain string', 'Conflict'), 'Conflict')
  assert.equal(extractErrorMessage(undefined, 'Unauthorized'), 'Unauthorized')
})

test('extractErrorMessage ignores non-string error/message fields', () => {
  // Defends against a backend regression that ships `{error: 42}` or
  // `{error: {nested: "..."}}`. We don't try to coerce — fall back to
  // statusText so the user still gets a readable banner.
  assert.equal(
    extractErrorMessage({ error: 42 }, 'Bad Request'),
    'Bad Request',
  )
  assert.equal(
    extractErrorMessage({ error: { nested: 'x' } }, 'Bad Request'),
    'Bad Request',
  )
})
