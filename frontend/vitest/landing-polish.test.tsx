import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('react-force-graph-2d', () => ({
  default: () => React.createElement('div', { 'data-testid': 'force-graph' }),
}))

import LandingPage from '../src/pages/LandingPage'
import { ShowcaseSection } from '../src/components/landing/ShowcaseSection'
import { getDatasetList, runDatasetQuery } from '../src/data/datasets'
import { ShowcaseCard } from '../src/components/landing/ShowcaseCard'

describe('landing polish redesign', () => {
  it('renders sticky nav with section anchors and route buttons', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    expect(html).toContain('OpenGraphDB')
    expect(html).toContain('href="#features"')
    expect(html).toContain('href="#get-started"')
    expect(html).toContain('href="/playground"')
    expect(html).toContain('scroll-smooth')
  })

  it('renders showcase section with all datasets and playground query links', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ShowcaseSection />
      </MemoryRouter>
    )

    const datasets = getDatasetList()
    expect(html).toContain('id="showcase"')

    for (const dataset of datasets) {
      expect(html).toContain(dataset.name)
      expect(html).toContain(`href="/playground?dataset=${dataset.key}"`)
    }
  })

  it('renders a showcase card with node and relationship statistics', () => {
    const dataset = getDatasetList()[0]
    const graphData = runDatasetQuery(dataset.key, 'all')

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ShowcaseCard
          datasetKey={dataset.key}
          name={dataset.name}
          description={dataset.description}
          nodeCount={dataset.nodeCount}
          linkCount={dataset.linkCount}
          labels={dataset.labels}
          graphData={graphData}
        />
      </MemoryRouter>
    )

    expect(html).toContain(`${dataset.nodeCount} nodes`)
    expect(html).toContain(`${dataset.linkCount} relationships`)
    expect(html).toContain('Explore in Playground')
  })

  it('renders Fraunces hero and AI integration section', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    // Fraunces hero: display font utility + current hero copy
    expect(html).toContain('font-display')
    expect(html).toContain('The single-file graph DB')
    expect(html).toContain('id="hero-heading"')

    // AI Integration section landed in the reposition
    expect(html).toContain('id="ai-integration"')
    expect(html).toContain('AI integration')

    // Copy buttons still exist on the Getting Started step commands
    expect(html).toContain('Copy')
  })
})
