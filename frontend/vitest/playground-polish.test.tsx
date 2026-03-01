import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('react-force-graph-2d', () => ({
  default: () => React.createElement('div', { 'data-testid': 'force-graph' }),
}))

import { DatasetSwitcher } from '../src/components/playground/DatasetSwitcher'
import { QueryCard } from '../src/components/playground/QueryCard'
import { ConnectionBadge } from '../src/components/playground/ConnectionBadge'
import { LiveModeToggle } from '../src/components/playground/LiveModeToggle'
import { StatsPanel } from '../src/components/playground/StatsPanel'
import PlaygroundPage, { groupQueriesByCategory } from '../src/pages/PlaygroundPage'
import { getDatasetList, getDatasetQueries, runDatasetQuery } from '../src/data/datasets'

function renderPlayground(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/playground" element={<PlaygroundPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('playground polish redesign', () => {
  it('renders dataset switcher options with active dataset description', () => {
    const datasets = getDatasetList()
    const active = datasets[0]
    const html = renderToStaticMarkup(
      <DatasetSwitcher activeDataset={active.key} onSwitch={() => {}} />
    )

    for (const dataset of datasets) {
      expect(html).toContain(dataset.name)
    }

    expect(html).toContain(active.description)
    expect(html).toContain('<select')
  })

  it('renders query card with description, cypher, result count, and active styles', () => {
    const query = getDatasetQueries('social')[1]
    const html = renderToStaticMarkup(
      <QueryCard query={query} isActive={true} resultCount={query.expectedResultCount} onClick={() => {}} />
    )

    expect(html).toContain(query.label)
    expect(html).toContain(query.description)
    expect(html).toContain('MATCH (a:User)-[:FOLLOWS]')
    expect(html).toContain(`${query.expectedResultCount} results`)
    expect(html).toContain('border-primary')
  })

  it('renders connection badge with mode and timing specific labels', () => {
    const sampleHtml = renderToStaticMarkup(<ConnectionBadge queryTimeMs={0} isLive={false} />)
    const liveHtml = renderToStaticMarkup(<ConnectionBadge queryTimeMs={18} isLive={true} />)
    const errorHtml = renderToStaticMarkup(
      <ConnectionBadge isLive={true} liveError="Live backend unavailable" />
    )

    expect(sampleHtml).toContain('Sample Data')
    expect(sampleHtml).toContain('(in-memory)')

    expect(liveHtml).toContain('Live')
    expect(liveHtml).toContain('18ms')
    expect(liveHtml).not.toContain('(in-memory)')

    expect(errorHtml).toContain('Error')
    expect(errorHtml).toContain('Live backend unavailable')
  })

  it('renders the sample/live toggle with both actions visible', () => {
    const offlineHtml = renderToStaticMarkup(
      <LiveModeToggle isLive={false} onChange={() => {}} />
    )
    const liveHtml = renderToStaticMarkup(<LiveModeToggle isLive={true} onChange={() => {}} />)

    expect(offlineHtml).toContain('Sample')
    expect(offlineHtml).toContain('Live')
    expect(liveHtml).toContain('Sample')
    expect(liveHtml).toContain('Live')
  })

  it('groups uncategorized queries under Explore for sidebar rendering', () => {
    const query = getDatasetQueries('movies')[0]
    const grouped = groupQueriesByCategory([
      { ...query, key: 'uncategorized', category: undefined },
      { ...query, key: 'analyze', category: 'Analyze' },
    ])

    expect(grouped.Explore.map((item) => item.key)).toEqual(['uncategorized'])
    expect(grouped.Analyze.map((item) => item.key)).toEqual(['analyze'])
  })

  it('renders stats panel with node, edge, and label counts', () => {
    const html = renderToStaticMarkup(<StatsPanel nodeCount={18} edgeCount={24} labelCount={3} />)

    expect(html).toContain('Nodes')
    expect(html).toContain('Edges')
    expect(html).toContain('Labels')
    expect(html).toContain('18')
    expect(html).toContain('24')
    expect(html).toContain('3')
  })

  it('uses dataset search params for initial playground dataset and renders split-pane controls', () => {
    const socialAll = runDatasetQuery('social', 'all')
    const html = renderPlayground('/playground?dataset=social')

    expect(html).toContain('Playground')
    expect(html).toContain('Guided Queries')
    expect(html).toContain('Sample')
    expect(html).toContain('Live')
    expect(html).toContain('Sample Data')
    expect(html).toContain('Explore')
    expect(html).toContain('Traverse')
    expect(html).toContain('Social Network')
    expect(html).toContain(`${socialAll.nodes.length}`)
    expect(html).toContain(`${socialAll.links.length}`)
    expect(html).toContain('w-[320px]')
    expect(html).toContain('data-testid="force-graph"')
  })
})
