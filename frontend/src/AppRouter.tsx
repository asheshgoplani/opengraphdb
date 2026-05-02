// DEPRECATED (S6): combined marketing + app router.
// Replaced by the split build:
//   - `MarketingRouter.tsx` (loaded via `marketing-main.tsx` → `index-marketing.html` → `dist-marketing/`)
//   - `AppShellRouter.tsx`  (loaded via `app-main.tsx`       → `index-app.html`       → `dist-app/`)
// Kept in tree because `main.tsx` and `index.html` (the legacy `npm run dev`
// entry) still reach the heavy routes through it. S7 will retire the legacy
// entry once the SPA is embedded in the `ogdb` binary; this file goes with it.
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import { RouteErrorBoundary } from './components/layout/RouteErrorBoundary'

// M1 (audit 2026-04-23b): the "Loading…" spinner used to stall 1.5-1.7s on
// cold navigation to `/`, `/playground`, and `/app` because every route was
// behind `React.lazy` — the landing page itself had to wait for its chunk
// over a fresh network round-trip. Landing is the first page users see, so
// we import it eagerly to kill the spinner on `/`.
//
// Playground/App/Claims remain lazy (they're big — cosmos + codemirror +
// framer-motion), but we kick off their prefetch as soon as the landing
// page has painted so the next-click navigation is warm.
const PlaygroundPageLazy = lazy(() => import('./pages/PlaygroundPage'))
const ClaimsPageLazy = lazy(() => import('./pages/ClaimsPage'))
// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6: the marketing build's MarketingRouter
// owns the `/docs/<slug>` AI-integration pattern pages. The dev router served
// by `npm run dev` (this file) was missing that route, so e2e tests clicking
// "Read the pattern" landed on `Navigate to=/` and never rendered DocPage.
const DocPageLazy = lazy(() => import('./pages/DocPage'))

export function AppRouter() {
  // Prefetch the heavy routes once the landing page has painted. Uses
  // requestIdleCallback where available so we don't compete with hero
  // animations; otherwise a short timeout. These imports resolve to already-
  // cached promises by the time the user clicks "Open the playground".
  useEffect(() => {
    const prefetch = () => {
      void import('./pages/PlaygroundPage')
      void import('./pages/ClaimsPage')
    }
    type RequestIdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    const w = window as RequestIdleWindow
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(prefetch, { timeout: 2000 })
    } else {
      const id = window.setTimeout(prefetch, 400)
      return () => window.clearTimeout(id)
    }
  }, [])

  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-background">
            <p className="animate-pulse text-muted-foreground">Loading…</p>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/playground" element={<PlaygroundPageLazy />} />
          <Route path="/claims" element={<ClaimsPageLazy />} />
          <Route path="/docs/:slug" element={<DocPageLazy />} />
          {/* QA bug #5 (2026-04-30): the dev router (legacy `npm run dev`) used
              to render the heavy `<App />` component for /app, while the
              production AppShellRouter already redirects /app→/playground.
              Mirror the redirect here so behaviour matches across builds. */}
          <Route path="/app" element={<Navigate to="/playground" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}
