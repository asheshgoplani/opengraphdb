import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { DATASETS, getDatasetList, getDatasetQueries, runDatasetQuery, type DatasetKey } from './datasets.js'

function toNodeId(value: string | number | { id: string | number }): string | number {
  return typeof value === 'object' ? value.id : value
}

function getReferencedNodeIds(result: { links: Array<{ source: string | number | { id: string | number }; target: string | number | { id: string | number } }> }) {
  const ids = new Set<string | number>()
  for (const link of result.links) {
    ids.add(toNodeId(link.source))
    ids.add(toNodeId(link.target))
  }
  return ids
}

test('getDatasetList returns exactly movielens, airroutes, got, and wikidata with valid metadata', () => {
  const list = getDatasetList()

  assert.equal(list.length, 4)
  assert.deepEqual(
    new Set(list.map((dataset) => dataset.key)),
    new Set<DatasetKey>(['movielens', 'airroutes', 'got', 'wikidata'])
  )

  for (const meta of list) {
    assert.ok(meta.name.length > 0)
    assert.ok(meta.description.length > 0)
    assert.ok(meta.nodeCount > 0)
    assert.ok(meta.linkCount > 0)
    assert.ok(Array.isArray(meta.labels))
    assert.ok(meta.labels.length > 0)
  }
})

test('getDatasetList node and link counts match the underlying dataset data', () => {
  const list = getDatasetList()

  for (const meta of list) {
    const source = DATASETS[meta.key].data
    assert.equal(meta.nodeCount, source.nodes.length)
    assert.equal(meta.linkCount, source.links.length)

    const sourceLabels = [...new Set(source.nodes.flatMap((node) => node.labels))].sort()
    assert.deepEqual(meta.labels, sourceLabels)
  }
})

test('every dataset has guided queries including all', () => {
  const keys: DatasetKey[] = ['movielens', 'airroutes', 'got', 'wikidata']

  for (const key of keys) {
    const queries = getDatasetQueries(key)
    assert.ok(queries.length >= 3)
    assert.ok(queries.some((query) => query.key === 'all'))
  }
})

test("runDatasetQuery('all') returns complete data with new references for all datasets", () => {
  const keys: DatasetKey[] = ['movielens', 'airroutes', 'got', 'wikidata']

  for (const key of keys) {
    const source = DATASETS[key].data
    const result = runDatasetQuery(key, 'all')

    assert.deepEqual(result, source)
    assert.notStrictEqual(result, source)
    assert.notStrictEqual(result.nodes, source.nodes)
    assert.notStrictEqual(result.links, source.links)
    assert.notStrictEqual(result.nodes[0], source.nodes[0])
    assert.notStrictEqual(result.links[0], source.links[0])

    const firstNodeLabelBefore = source.nodes[0].label
    result.nodes[0].label = 'MUTATED'
    assert.equal(source.nodes[0].label, firstNodeLabelBefore)
  }
})

test('relationship-filtered queries return orphan-free connected subgraphs', () => {
  const keys: DatasetKey[] = ['movielens', 'airroutes', 'got', 'wikidata']

  for (const key of keys) {
    const queries = getDatasetQueries(key).filter((query) => query.key !== 'all')
    assert.ok(queries.length > 0)

    for (const query of queries) {
      const source = DATASETS[key].data
      const result = runDatasetQuery(key, query.key)
      const referencedNodeIds = getReferencedNodeIds(result)
      const nodeIds = new Set(result.nodes.map((node) => node.id))

      assert.ok(result.nodes.length > 0)
      assert.notStrictEqual(result, source)
      assert.notStrictEqual(result.nodes, source.nodes)
      assert.notStrictEqual(result.links, source.links)

      if (result.links.length > 0) {
        assert.deepEqual(nodeIds, referencedNodeIds)
        assert.ok(result.nodes.every((node) => referencedNodeIds.has(node.id)))
      }
    }
  }
})

test('dataset labels include expected domain entities', () => {
  const list = getDatasetList()
  const labelsByDataset = new Map(list.map((dataset) => [dataset.key, new Set(dataset.labels)]))

  assert.ok(labelsByDataset.get('movielens')?.has('Movie'))
  assert.ok(labelsByDataset.get('movielens')?.has('Genre'))

  assert.ok(labelsByDataset.get('airroutes')?.has('Airport'))
  assert.ok(labelsByDataset.get('airroutes')?.has('Country'))
  assert.ok(labelsByDataset.get('airroutes')?.has('Continent'))

  assert.ok(labelsByDataset.get('got')?.has('Character'))
  assert.ok(labelsByDataset.get('got')?.has('Season'))

  assert.ok(labelsByDataset.get('wikidata')?.has('Laureate'))
  assert.ok(labelsByDataset.get('wikidata')?.has('Category'))
  assert.ok(labelsByDataset.get('wikidata')?.has('Country'))
})
