import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareCypherQuery } from './query-utils.js'

test('prepareCypherQuery appends LIMIT when missing', () => {
  const input = 'MATCH (n) RETURN n'
  assert.equal(prepareCypherQuery(input, 25), 'MATCH (n) RETURN n LIMIT 25')
})

test('prepareCypherQuery preserves existing LIMIT clause', () => {
  const input = 'MATCH (n) RETURN n LIMIT 10'
  assert.equal(prepareCypherQuery(input, 25), 'MATCH (n) RETURN n LIMIT 10')
})

test('prepareCypherQuery returns empty for blank input', () => {
  assert.equal(prepareCypherQuery('   ', 25), '')
})
