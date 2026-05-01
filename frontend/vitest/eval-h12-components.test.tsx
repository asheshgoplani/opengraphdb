import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-force-graph-2d', () => ({
  default: () => React.createElement('div', { 'data-testid': 'force-graph' }),
}))

vi.mock('@neo4j-cypher/react-codemirror', () => ({
  CypherEditor: () => React.createElement('div', { 'data-testid': 'cypher-editor-stub' }),
  cypher: () => ({}),
  darkThemeConstants: {},
  lightThemeConstants: {},
}))

import { DatasetSwitcher } from '../src/components/playground/DatasetSwitcher'
import { SchemaBrowser } from '../src/components/playground/SchemaBrowser'
import { TableView } from '../src/components/results/TableView'
import { transformLiveResponse } from '../src/api/transform'
import type { GraphData } from '../src/types/graph'

describe('H12 — DatasetSwitcher renders accessible select', () => {
  it('label points at select via htmlFor + select carries id + aria-label', () => {
    const html = renderToStaticMarkup(
      <DatasetSwitcher activeDataset="movielens" onSwitch={() => {}} />
    )
    expect(html).toMatch(/<label[^>]*for="dataset-switcher"/)
    expect(html).toMatch(/<select[^>]*id="dataset-switcher"/)
    expect(html).toMatch(/<select[^>]*aria-label="Dataset"/)
  })

  it('emits one option per known dataset', () => {
    const html = renderToStaticMarkup(
      <DatasetSwitcher activeDataset="movielens" onSwitch={() => {}} />
    )
    const options = (html.match(/<option /g) || []).length
    expect(options).toBeGreaterThanOrEqual(2)
  })
})

describe('H12 — SchemaBrowser empty + populated branches', () => {
  const empty: GraphData = { nodes: [], links: [] }
  const populated: GraphData = {
    nodes: [
      { id: 'a', labels: ['Movie'], properties: { title: 'A' } },
      { id: 'b', labels: ['Person'], properties: { name: 'B' } },
    ],
    links: [{ id: 'r', source: 'a', target: 'b', type: 'ACTED_IN', properties: {} }],
  }

  it('empty state does NOT declare role=tree (BLOCKER-3 regression)', () => {
    const html = renderToStaticMarkup(
      <SchemaBrowser
        graphData={empty}
        selectedLabel={null}
        ontologyMode={false}
        onSelectLabel={() => {}}
        onToggleOntology={() => {}}
      />
    )
    expect(html).toMatch(/data-testid="schema-browser-empty"/)
    expect(html).not.toMatch(/role="tree"/)
    expect(html).toMatch(/aria-label="Schema"/)
  })

  it('populated state renders inner role=tree with treeitem children', () => {
    const html = renderToStaticMarkup(
      <SchemaBrowser
        graphData={populated}
        selectedLabel={null}
        ontologyMode={false}
        onSelectLabel={() => {}}
        onToggleOntology={() => {}}
      />
    )
    expect(html).toMatch(/role="tree"/)
    expect(html).toMatch(/role="treeitem"/)
    expect(html).toMatch(/aria-selected/)
  })
})

describe('H12 — TableView column inference', () => {
  it('renders a static markup root for empty graph', () => {
    const html = renderToStaticMarkup(
      <TableView graphData={{ nodes: [], links: [] }} />
    )
    expect(html).toBeTruthy()
  })

  it('renders rows for graph nodes with heterogeneous properties', () => {
    const data: GraphData = {
      nodes: [
        { id: 'a', labels: ['Movie'], properties: { title: 'A', year: 2020 } },
        { id: 'b', labels: ['Movie'], properties: { title: 'B', rating: 4.5 } },
      ],
      links: [],
    }
    const html = renderToStaticMarkup(<TableView graphData={data} />)
    expect(html).toContain('A')
    expect(html).toContain('B')
  })
})

describe('H12 — transformLiveResponse projects rows to graph', () => {
  it('handles empty response with descriptor', () => {
    const out = transformLiveResponse(
      { columns: [], rows: [], row_count: 0 },
      { nodeColumns: [] },
    )
    expect(out.nodes).toEqual([])
    expect(out.links).toEqual([])
  })

  it('extracts named values into nodes per descriptor.nodeColumns', () => {
    const out = transformLiveResponse(
      {
        columns: ['name', 'props'],
        rows: [{ name: 'X', props: { title: 'X' } }],
        row_count: 1,
      },
      {
        nodeColumns: [{ nameCol: 'name', propsCol: 'props', label: 'Movie' }],
      },
    )
    expect(out.nodes.length).toBe(1)
    expect(out.nodes[0].labels).toContain('Movie')
  })

  it('skips empty / null name cells without throwing', () => {
    const out = transformLiveResponse(
      {
        columns: ['name', 'props'],
        rows: [
          { name: null, props: {} },
          { name: '', props: {} },
          { name: 'real', props: {} },
        ],
        row_count: 3,
      },
      {
        nodeColumns: [{ nameCol: 'name', propsCol: 'props', label: 'Person' }],
      },
    )
    expect(out.nodes.length).toBe(1)
  })
})
