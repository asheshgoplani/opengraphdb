import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import { RouteErrorBoundary } from './components/layout/RouteErrorBoundary'

// EVAL-FRONTEND-QUALITY-CYCLE3.md H-6: lazy-load DocPage so the markdown
// content + renderer don't bloat the landing-page first-load. The landing
// is the conversion-critical surface; /docs/<slug> is reachable but rare.
const DocPageLazy = lazy(() => import('./pages/DocPage'))

// S6: marketing build target — public landing page only.
// All non-/ paths redirect to / so a curious crawler hitting /playground
// or /app on the public site gets bounced back to the marketing surface
// rather than seeing a blank app shell or a 404. Cycle-3 H-6 added the
// `/docs/<slug>` route for the AI integration patterns.
export function MarketingRouter() {
  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <div role="status" aria-live="polite" className="flex h-screen items-center justify-center bg-background">
            <p className="animate-pulse text-muted-foreground">Loading documentation…</p>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/docs/:slug" element={<DocPageLazy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}
