// Regression coverage for the three HIGH visual findings in
// .planning/c9-visual-verify/REPORT.md:
//
//   HIGH-1: AI-integration code cards overflowed horizontally with no
//           visible scrollbar — long lines silently clipped because WebKit
//           auto-hide the scrollbar on a dark <pre>.
//   HIGH-2: /docs/<slug> markdown rendered without heading typography —
//           `prose prose-neutral` classes were emitted but the
//           @tailwindcss/typography plugin was not enabled.
//   HIGH-3: Schema Browser header used a `from-primary/20` amber gradient
//           which read as peach/pink on the cream surface and broke the
//           amber-terminal palette consistency the rest of the playground +
//           BackendSchemaStrip use (cyan `--accent`).
//
// Each test pins the *observable* repair so a future refactor can't
// silently regress the visual fix.
import * as React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// React is imported for the classic JSX runtime used by the vitest pipeline
// (matches landing-polish.test.tsx). The void below is the standard pattern
// for keeping the import without tripping noUnusedLocals.
void React
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodeSnippetCard } from '../src/components/landing/CodeSnippetCard'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(here, '..')

describe('cycle-9 visual HIGH fixes', () => {
  it('HIGH-1: CodeSnippetCard <pre> carries .scrollbar-code so the scroll affordance is always visible', () => {
    const html = renderToStaticMarkup(
      <CodeSnippetCard
        index={0}
        title="Example"
        whyCare="why"
        language="python"
        code={'a_really_long_line_that_would_overflow_the_card_horizontally_without_a_scrollbar = 1'}
        docHref="/docs/example"
      />,
    )
    // The fix is: dark <pre> must keep both overflow-x:auto AND a custom
    // always-visible scrollbar utility. Either alone leaves the silent-clip
    // bug from HIGH-1.
    expect(html).toMatch(/class="[^"]*\bscrollbar-code\b[^"]*\boverflow-x-auto\b/)
  })

  it('HIGH-1: index.css declares .scrollbar-code with WebKit + Firefox styling', () => {
    const css = readFileSync(resolve(frontendRoot, 'src', 'index.css'), 'utf8')
    expect(css).toMatch(/\.scrollbar-code\s*\{[^}]*scrollbar-width:\s*thin/)
    expect(css).toMatch(/\.scrollbar-code::-webkit-scrollbar\s*\{/)
    expect(css).toMatch(/\.scrollbar-code::-webkit-scrollbar-thumb\s*\{/)
  })

  it('HIGH-2: tailwind.config.js enables @tailwindcss/typography so DocPage `prose` classes apply', () => {
    const cfg = readFileSync(resolve(frontendRoot, 'tailwind.config.js'), 'utf8')
    expect(cfg).toMatch(/@tailwindcss\/typography/)
    // The DocPage already wraps the markdown in `<article className="prose
    // prose-neutral max-w-none dark:prose-invert">`. Without the plugin
    // those classes are no-ops; with it, h1/h2/h3/p/li gain the visible
    // typography that closes HIGH-2.
    const docPage = readFileSync(
      resolve(frontendRoot, 'src', 'pages', 'DocPage.tsx'),
      'utf8',
    )
    expect(docPage).toMatch(/className="prose prose-neutral[^"]*"/)
  })

  it('HIGH-2: package.json declares @tailwindcss/typography devDependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'),
    ) as { devDependencies?: Record<string, string> }
    expect(pkg.devDependencies?.['@tailwindcss/typography']).toBeDefined()
  })

  it('HIGH-3: Schema Browser header no longer uses `from-primary/*` gradient (peach leak)', () => {
    const playgroundSrc = readFileSync(
      resolve(frontendRoot, 'src', 'pages', 'PlaygroundPage.tsx'),
      'utf8',
    )
    // Locate the schema-browser-header opening tag and grab its className.
    const headerMatch = playgroundSrc.match(
      /data-testid="schema-browser-header"[^]*?className="([^"]+)"/,
    )
    expect(headerMatch, 'schema-browser-header div with className must exist').toBeTruthy()
    const className = headerMatch?.[1] ?? ''
    // Repair pins:
    //   - no `from-primary` (the amber-on-cream blend that read as peach).
    //   - the gradient now routes through `accent` so it harmonises with
    //     BackendSchemaStrip's `bg-accent/10` and the `text-accent` heading.
    expect(className).not.toMatch(/\bfrom-primary\b/)
    expect(className).not.toMatch(/\bvia-primary\b/)
    expect(className).toMatch(/\bfrom-accent\//)
  })
})
