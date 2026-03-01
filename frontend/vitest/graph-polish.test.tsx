import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GraphLegend } from '../src/components/graph/GraphLegend'
import { LABEL_COLORS, getLabelColor } from '../src/components/graph/NodeRenderer'

describe('graph polish', () => {
  it('assigns label colors deterministically', () => {
    const labelIndex = new Map<string, number>()

    expect(getLabelColor('Movie', labelIndex)).toBe(LABEL_COLORS[0])
    expect(getLabelColor('Person', labelIndex)).toBe(LABEL_COLORS[1])
    expect(getLabelColor('Movie', labelIndex)).toBe(LABEL_COLORS[0])
  })

  it('renders graph legend as an overlay with color markers', () => {
    const labelIndex = new Map<string, number>([
      ['Movie', 0],
      ['Person', 1],
    ])

    const html = renderToStaticMarkup(
      <GraphLegend labels={['Movie', 'Person']} labelIndex={labelIndex} />
    )

    expect(html).toContain('Legend')
    expect(html).toContain('absolute bottom-3 left-3')
    expect(html).toContain(`background-color:${LABEL_COLORS[0]}`)
    expect(html).toContain(`background-color:${LABEL_COLORS[1]}`)
  })
})
