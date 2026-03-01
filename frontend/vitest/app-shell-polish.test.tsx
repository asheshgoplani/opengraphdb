import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { vi } from 'vitest'

vi.mock('react-force-graph-2d', () => ({
  default: () => React.createElement('div', { 'data-testid': 'force-graph' }),
}))

import { getConnectionStatusModel } from '../src/components/layout/ConnectionStatus'
import { getResultsSummaryText } from '../src/components/results/ResultsBanner'
import { ResultsView, getResultsViewToggleClass } from '../src/components/results/ResultsView'
import { useQueryStore } from '../src/stores/query'
import { ResultsEmptyState } from '../src/components/results/ResultsEmptyState'
import type { GraphData } from '../src/types/graph'

const graphData: GraphData = {
  nodes: [
    { id: 'n1', labels: ['Movie'], properties: { title: 'The Matrix' } },
    { id: 'n2', labels: ['Person'], properties: { name: 'Keanu Reeves' } },
  ],
  links: [
    { id: 'e1', source: 'n2', target: 'n1', type: 'ACTED_IN', properties: {} },
  ],
}

describe('app shell polish', () => {
  it('models connected status with server URL details', () => {
    const model = getConnectionStatusModel({
      isConnecting: false,
      isConnected: true,
      serverUrl: 'http://localhost:8080',
    })

    expect(model.variant).toBe('connected')
    expect(model.statusText).toBe('Connected')
    expect(model.serverLabel).toBe('localhost:8080')
  })

  it('models disconnected state without server URL label', () => {
    const model = getConnectionStatusModel({
      isConnecting: false,
      isConnected: false,
      serverUrl: 'http://localhost:8080',
    })

    expect(model.variant).toBe('disconnected')
    expect(model.statusText).toBe('Disconnected')
    expect(model.serverLabel).toBeNull()
  })

  it('formats results summary text for normal and limited responses', () => {
    expect(
      getResultsSummaryText({
        nodeCount: 7,
        edgeCount: 12,
        isLimited: false,
        resultLimit: 500,
      })
    ).toBe('7 nodes · 12 edges')

    expect(
      getResultsSummaryText({
        nodeCount: 7,
        edgeCount: 12,
        isLimited: true,
        resultLimit: 100,
      })
    ).toBe('Showing first 100 records')
  })

  it('renders graph/table toggle with active styling based on query store mode', () => {
    useQueryStore.getState().setViewMode('graph')

    const graphHtml = renderToStaticMarkup(<ResultsView graphData={graphData} />)
    expect(graphHtml).toContain('Graph')
    expect(graphHtml).toContain('Table')
    expect(graphHtml).toContain(getResultsViewToggleClass(true))
    expect(getResultsViewToggleClass(false)).toContain('hover:bg-accent')
  })

  it('renders polished app empty state copy and animation classes', () => {
    const html = renderToStaticMarkup(<ResultsEmptyState />)

    expect(html).toContain('Run a query to see results')
    expect(html).toContain('Try the example below')
    expect(html).toContain('MATCH (n) RETURN n LIMIT 25')
    expect(html).toContain('animate-fade-in')
  })
})
