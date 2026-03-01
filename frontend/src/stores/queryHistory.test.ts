import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHistoryWithQuery, MAX_HISTORY_ENTRIES } from './queryHistory.js'

test('buildHistoryWithQuery prepends newest query', () => {
  const next = buildHistoryWithQuery(['MATCH (n) RETURN n'], 'MATCH (p:Person) RETURN p')
  assert.deepEqual(next, ['MATCH (p:Person) RETURN p', 'MATCH (n) RETURN n'])
})

test('buildHistoryWithQuery deduplicates existing entries', () => {
  const next = buildHistoryWithQuery(
    ['MATCH (n) RETURN n', 'MATCH (p:Person) RETURN p'],
    'MATCH (n) RETURN n'
  )

  assert.deepEqual(next, ['MATCH (n) RETURN n', 'MATCH (p:Person) RETURN p'])
})

test('buildHistoryWithQuery trims and ignores blank queries', () => {
  const existing = ['MATCH (n) RETURN n']
  const next = buildHistoryWithQuery(existing, '   ')
  assert.deepEqual(next, existing)
})

test('buildHistoryWithQuery caps the history length', () => {
  const existing = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => `MATCH (${i}) RETURN ${i}`)
  const next = buildHistoryWithQuery(existing, 'MATCH (latest) RETURN latest')

  assert.equal(next.length, MAX_HISTORY_ENTRIES)
  assert.equal(next[0], 'MATCH (latest) RETURN latest')
})
