// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6 — unit-test surface for the minimal
// markdown renderer that powers `/docs/<slug>`. The renderer is small
// enough that a few golden cases pin the contract and lock the XSS gate
// (any change that loosens HTML escaping or url filtering must update
// these tests).

import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown/renderMarkdown'

describe('renderMarkdown (H-6)', () => {
  it('renders ATX headings + paragraphs + bold + italic + inline code', () => {
    const out = renderMarkdown(
      [
        '# Title',
        '',
        '## Subtitle',
        '',
        'A paragraph with **bold** and *italic* and `inline code`.',
      ].join('\n')
    )
    expect(out).toContain('<h1>Title</h1>')
    expect(out).toContain('<h2>Subtitle</h2>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>italic</em>')
    expect(out).toContain('<code>inline code</code>')
  })

  it('renders fenced code blocks with a language class', () => {
    const out = renderMarkdown(
      ['```python', 'print("hi")', '```'].join('\n')
    )
    expect(out).toContain('<pre><code class="language-python">')
    expect(out).toContain('print(&quot;hi&quot;)')
  })

  it('renders bullet lists', () => {
    const out = renderMarkdown(['- one', '- two', '- three'].join('\n'))
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>one</li>')
    expect(out).toContain('<li>two</li>')
    expect(out).toContain('<li>three</li>')
    expect(out).toContain('</ul>')
  })

  it('renders ordered lists', () => {
    const out = renderMarkdown(['1. first', '2. second'].join('\n'))
    expect(out).toContain('<ol>')
    expect(out).toContain('<li>first</li>')
    expect(out).toContain('<li>second</li>')
    expect(out).toContain('</ol>')
  })

  it('escapes raw HTML in paragraphs (XSS gate)', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    // The paragraph rule fires; the script tag is escaped, not emitted.
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('filters javascript: URLs in links', () => {
    const out = renderMarkdown('[click](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="#"')
  })

  it('renders a same-origin path link', () => {
    const out = renderMarkdown('See [the playground](/playground).')
    expect(out).toContain('<a href="/playground">the playground</a>')
  })

  it('renders an absolute https link', () => {
    const out = renderMarkdown('See [github](https://github.com/asheshgoplani/opengraphdb).')
    expect(out).toContain(
      '<a href="https://github.com/asheshgoplani/opengraphdb">github</a>'
    )
  })

  it('renders horizontal rules', () => {
    const out = renderMarkdown(['before', '', '---', '', 'after'].join('\n'))
    expect(out).toContain('<hr />')
  })
})
