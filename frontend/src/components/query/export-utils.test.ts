import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCsvString, buildJsonString } from './export-utils.js'
import type { QueryResponse } from '../../types/api.js'

function parseCsvRows(csv: string): string[] {
  return csv.replace(/^\ufeff/, '').split('\n')
}

test('buildJsonString returns formatted JSON', () => {
  const data: QueryResponse = {
    nodes: [],
    relationships: [],
    columns: ['name'],
    rows: [['Alice']],
  }

  const json = buildJsonString(data)
  assert.equal(
    json,
    JSON.stringify(
      {
        nodes: [],
        relationships: [],
        columns: ['name'],
        rows: [['Alice']],
      },
      null,
      2
    )
  )
})

test('buildCsvString builds CSV for tabular responses', () => {
  const data: QueryResponse = {
    nodes: [],
    relationships: [],
    columns: ['name', 'age'],
    rows: [
      ['Alice', 31],
      ['Bob', 29],
    ],
  }

  const csv = buildCsvString(data)
  const rows = parseCsvRows(csv)

  assert.equal(rows[0], '"name","age"')
  assert.equal(rows[1], '"Alice","31"')
  assert.equal(rows[2], '"Bob","29"')
})

test('buildCsvString builds CSV for graph responses with unioned property keys', () => {
  const data: QueryResponse = {
    nodes: [
      {
        id: '1',
        labels: ['Person'],
        properties: { name: 'Alice', age: 31 },
      },
      {
        id: '2',
        labels: ['Person', 'Employee'],
        properties: { name: 'Bob', team: 'Platform' },
      },
    ],
    relationships: [],
  }

  const csv = buildCsvString(data)
  const rows = parseCsvRows(csv)

  assert.equal(rows[0], '"id","labels","name","age","team"')
  assert.equal(rows[1], '"1","Person","Alice","31",""')
  assert.equal(rows[2], '"2","Person;Employee","Bob","","Platform"')
})

test('buildCsvString escapes double quotes in values', () => {
  const data: QueryResponse = {
    nodes: [
      {
        id: '1',
        labels: ['Person'],
        properties: { quote: 'She said "hello"' },
      },
    ],
    relationships: [],
  }

  const csv = buildCsvString(data)
  const rows = parseCsvRows(csv)

  assert.equal(rows[0], '"id","labels","quote"')
  assert.equal(rows[1], '"1","Person","She said ""hello"""')
})

test('buildCsvString fills missing property values with empty strings', () => {
  const data: QueryResponse = {
    nodes: [
      {
        id: '1',
        labels: ['Person'],
        properties: { name: 'Alice' },
      },
      {
        id: '2',
        labels: ['Person'],
        properties: { age: 29 },
      },
    ],
    relationships: [],
  }

  const csv = buildCsvString(data)
  const rows = parseCsvRows(csv)

  assert.equal(rows[0], '"id","labels","name","age"')
  assert.equal(rows[1], '"1","Person","Alice",""')
  assert.equal(rows[2], '"2","Person","","29"')
})
