import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RouteErrorBoundary } from './RouteErrorBoundary.js'

test('RouteErrorBoundary renders children when no error [H22]', () => {
  const html = renderToStaticMarkup(
    <RouteErrorBoundary>
      <div data-testid="happy">ok</div>
    </RouteErrorBoundary>,
  )
  assert.match(html, /data-testid="happy"/)
})

test('RouteErrorBoundary derives error state and renders fallback [H22]', () => {
  const next = RouteErrorBoundary.getDerivedStateFromError(new Error('boom'))
  assert.ok(next.error instanceof Error)
  assert.equal(next.error.message, 'boom')

  // Render the fallback by feeding the boundary an instance with the derived state.
  const boundary = new RouteErrorBoundary({ children: null })
  Object.assign(boundary, { state: next })
  const fallback = renderToStaticMarkup(boundary.render() as ReactElement)
  assert.match(fallback, /data-testid="route-error-boundary"/)
  assert.match(fallback, /role="alert"/)
  assert.match(fallback, /Something broke/)
})
