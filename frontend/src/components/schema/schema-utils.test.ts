import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { getSchemaSectionItems } from './schema-utils.js'
import type { SchemaResponse } from '../../types/api.js'

const schema: SchemaResponse = {
  labels: ['Person', 'Movie'],
  relationshipTypes: ['ACTED_IN'],
  propertyKeys: ['name', 'released'],
}

test('getSchemaSectionItems returns values for known schema sections', () => {
  assert.deepEqual(getSchemaSectionItems(schema, 'labels'), ['Person', 'Movie'])
  assert.deepEqual(getSchemaSectionItems(schema, 'relationshipTypes'), ['ACTED_IN'])
  assert.deepEqual(getSchemaSectionItems(schema, 'propertyKeys'), ['name', 'released'])
})

test('getSchemaSectionItems falls back to an empty array for missing schema data', () => {
  assert.deepEqual(getSchemaSectionItems(undefined, 'labels'), [])
  assert.deepEqual(getSchemaSectionItems(undefined, 'relationshipTypes'), [])
  assert.deepEqual(getSchemaSectionItems(undefined, 'propertyKeys'), [])
})
