import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../src/api/client'
import { transformLiveResponse, type GraphQueryDescriptor } from '../src/api/transform'
import { DATASETS, getDatasetList, getDatasetQueries, type DatasetKey } from '../src/data/datasets'
import type { BackendQueryResponse } from '../src/types/api'

describe('transformLiveResponse', () => {
  it('deduplicates nodes and edges while skipping rows with empty key columns', () => {
    const response: BackendQueryResponse = {
      columns: ['person', 'movie', 'personProps', 'movieProps'],
      row_count: 5,
      rows: [
        {
          person: 'Keanu Reeves',
          movie: 'The Matrix',
          personProps: { born: 1964 },
          movieProps: { released: 1999 },
        },
        {
          person: 'Keanu Reeves',
          movie: 'The Matrix',
          personProps: { born: 1964 },
          movieProps: { released: 1999 },
        },
        {
          person: '',
          movie: 'The Matrix Reloaded',
          personProps: {},
          movieProps: { released: 2003 },
        },
        {
          person: 'Carrie-Anne Moss',
          movie: null,
          personProps: { born: 1967 },
          movieProps: {},
        },
        {
          person: 'Carrie-Anne Moss',
          movie: 'The Matrix Reloaded',
          personProps: { born: 1967 },
          movieProps: { released: 2003 },
        },
      ],
    }

    const descriptor: GraphQueryDescriptor = {
      nodeColumns: [
        { nameCol: 'person', propsCol: 'personProps', label: 'Person' },
        { nameCol: 'movie', propsCol: 'movieProps', label: 'Movie' },
      ],
      edgeDescriptors: [{ srcCol: 'person', dstCol: 'movie', type: 'ACTED_IN' }],
    }

    const graph = transformLiveResponse(response, descriptor)

    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      'Movie:The Matrix',
      'Movie:The Matrix Reloaded',
      'Person:Carrie-Anne Moss',
      'Person:Keanu Reeves',
    ])

    expect(graph.links).toHaveLength(2)
    expect(graph.links.map((l) => l.id).sort()).toEqual([
      'Person:Carrie-Anne Moss--ACTED_IN--Movie:The Matrix Reloaded',
      'Person:Keanu Reeves--ACTED_IN--Movie:The Matrix',
    ])

    const personNode = graph.nodes.find((node) => node.id === 'Person:Keanu Reeves')
    expect(personNode?.properties).toMatchObject({ born: 1964, _label: 'Person' })
  })

  it('returns only nodes when no edge descriptors are provided', () => {
    const response: BackendQueryResponse = {
      columns: ['title', 'props'],
      row_count: 2,
      rows: [
        { title: 'The Matrix', props: { released: 1999 } },
        { title: 'The Matrix Reloaded', props: { released: 2003 } },
      ],
    }

    const descriptor: GraphQueryDescriptor = {
      nodeColumns: [{ nameCol: 'title', propsCol: 'props', label: 'Movie' }],
    }

    const graph = transformLiveResponse(response, descriptor)

    expect(graph.nodes).toHaveLength(2)
    expect(graph.links).toHaveLength(0)
  })
})

describe('ApiClient.schema', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes backend schema field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        labels: ['Movie', 'Person'],
        edge_types: ['ACTED_IN', 'DIRECTED'],
        property_keys: ['name', 'title'],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const client = new ApiClient('http://localhost:3000')
    const schema = await client.schema()

    expect(schema).toEqual({
      labels: ['Movie', 'Person'],
      relationshipTypes: ['ACTED_IN', 'DIRECTED'],
      propertyKeys: ['name', 'title'],
    })
  })
})

describe('guided query metadata and expanded datasets', () => {
  it('ships every registered dataset with a non-trivial sample', () => {
    const datasets = getDatasetList()
    expect(datasets.length).toBeGreaterThanOrEqual(5)
    for (const meta of datasets) {
      expect(meta.nodeCount, `${meta.key} must ship a non-trivial sample`).toBeGreaterThanOrEqual(20)
      expect(meta.linkCount, `${meta.key} must ship a non-trivial sample`).toBeGreaterThanOrEqual(20)
    }
  })

  it('adds category and liveDescriptor metadata for guided queries', () => {
    const keys = Object.keys(DATASETS) as DatasetKey[]
    // community is a synthetic canvas-density demo with no backend equivalent —
    // its guided queries are browser-only, so skip the liveDescriptor assertion.
    const liveBackedKeys = keys.filter((key) => key !== 'community')

    for (const datasetKey of keys) {
      const queries = getDatasetQueries(datasetKey)
      expect(queries.length, `${datasetKey} must expose guided queries`).toBeGreaterThan(0)
      expect(queries[0].key, `${datasetKey} first query must be the dataset-wide 'all'`).toBe('all')
      for (const query of queries) {
        expect(query.category, `${datasetKey}.${query.key} must declare a category`).toBeDefined()
      }
    }

    for (const datasetKey of liveBackedKeys) {
      for (const query of getDatasetQueries(datasetKey)) {
        if (query.key === 'all') {
          expect(query.liveDescriptor).toBeUndefined()
        } else {
          expect(
            query.liveDescriptor,
            `${datasetKey}.${query.key} must define a liveDescriptor for backend execution`,
          ).toBeDefined()
        }
      }
    }
  })
})
