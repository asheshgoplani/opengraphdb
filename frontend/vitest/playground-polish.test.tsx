import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('react-force-graph-2d', () => ({
  default: () => React.createElement('div', { 'data-testid': 'force-graph' }),
}))

import { DatasetSwitcher } from '../src/components/playground/DatasetSwitcher'
import { QueryCard } from '../src/components/playground/QueryCard'
import { ConnectionBadge } from '../src/components/playground/ConnectionBadge'
import { StatsPanel } from '../src/components/playground/StatsPanel'
import PlaygroundPage from '../src/pages/PlaygroundPage'
import { getDatasetList, getDatasetQueries, runDatasetQuery } from '../src/data/datasets'

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

  it('renders connection badge with sample data label and in-memory timing', () => {
    const html = renderToStaticMarkup(<ConnectionBadge queryTimeMs={0} />)

    expect(html).toContain('Sample Data')
    expect(html).toContain('(in-memory)')
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
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/playground?dataset=social']}>
        <Routes>
          <Route path="/playground" element={<PlaygroundPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('Playground')
    expect(html).toContain('Guided Queries')
    expect(html).toContain('Sample Data')
    expect(html).toContain('Social Network')
    expect(html).toContain(`${socialAll.nodes.length}`)
    expect(html).toContain(`${socialAll.links.length}`)
    expect(html).toContain('w-[320px]')
    expect(html).toContain('data-testid="force-graph"')
  })
})
