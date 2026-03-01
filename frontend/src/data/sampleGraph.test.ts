import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOVIES_SAMPLE, runPlaygroundQuery } from './sampleGraph.js'

function referencedNodeIds(
  links: Array<{ source: string | number | { id: string | number }; target: string | number | { id: string | number } }>
) {
  const ids = new Set<string | number>()
  for (const link of links) {
    ids.add(typeof link.source === 'object' ? link.source.id : link.source)
    ids.add(typeof link.target === 'object' ? link.target.id : link.target)
  }
  return ids
}

test('MOVIES_SAMPLE has expected node and link volumes', () => {
  assert.ok(MOVIES_SAMPLE.nodes.length >= 15 && MOVIES_SAMPLE.nodes.length <= 25)
  assert.ok(MOVIES_SAMPLE.links.length >= 25 && MOVIES_SAMPLE.links.length <= 50)
})

test('MOVIES_SAMPLE includes Movie and Person labels', () => {
  const labels = new Set(MOVIES_SAMPLE.nodes.flatMap((n) => n.labels))
  assert.ok(labels.has('Movie'))
  assert.ok(labels.has('Person'))
})

test('MOVIES_SAMPLE includes ACTED_IN, DIRECTED, and WROTE relationship types', () => {
  const linkTypes = new Set(MOVIES_SAMPLE.links.map((l) => l.type))
  assert.ok(linkTypes.has('ACTED_IN'))
  assert.ok(linkTypes.has('DIRECTED'))
  assert.ok(linkTypes.has('WROTE'))
})

test("runPlaygroundQuery('all') returns all data with new object references", () => {
  const result = runPlaygroundQuery('all')

  assert.deepEqual(result, MOVIES_SAMPLE)
  assert.notStrictEqual(result, MOVIES_SAMPLE)
  assert.notStrictEqual(result.nodes, MOVIES_SAMPLE.nodes)
  assert.notStrictEqual(result.links, MOVIES_SAMPLE.links)
  assert.notStrictEqual(result.nodes[0], MOVIES_SAMPLE.nodes[0])
  assert.notStrictEqual(result.links[0], MOVIES_SAMPLE.links[0])
})

test("runPlaygroundQuery('movies-only') returns only Movie nodes and no links", () => {
  const result = runPlaygroundQuery('movies-only')

  assert.ok(result.nodes.length > 0)
  assert.equal(result.links.length, 0)
  assert.ok(result.nodes.every((n) => n.labels.includes('Movie')))
})

test("runPlaygroundQuery('actors-only') returns only Person nodes and no links", () => {
  const result = runPlaygroundQuery('actors-only')

  assert.ok(result.nodes.length > 0)
  assert.equal(result.links.length, 0)
  assert.ok(result.nodes.every((n) => n.labels.includes('Person')))
})

test("runPlaygroundQuery('acted-in') returns only ACTED_IN links with no orphan nodes", () => {
  const result = runPlaygroundQuery('acted-in')
  const idsFromLinks = referencedNodeIds(result.links)
  const resultNodeIds = new Set(result.nodes.map((n) => n.id))

  assert.ok(result.links.length > 0)
  assert.ok(result.links.every((l) => l.type === 'ACTED_IN'))
  assert.ok(result.nodes.every((n) => idsFromLinks.has(n.id)))
  assert.deepEqual(resultNodeIds, idsFromLinks)
})

test("runPlaygroundQuery('directed') returns only DIRECTED links with no orphan nodes", () => {
  const result = runPlaygroundQuery('directed')
  const idsFromLinks = referencedNodeIds(result.links)
  const resultNodeIds = new Set(result.nodes.map((n) => n.id))

  assert.ok(result.links.length > 0)
  assert.ok(result.links.every((l) => l.type === 'DIRECTED'))
  assert.ok(result.nodes.every((n) => idsFromLinks.has(n.id)))
  assert.deepEqual(resultNodeIds, idsFromLinks)
})
