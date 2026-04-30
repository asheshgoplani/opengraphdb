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
const AppLazy = lazy(() => import('./App'))

export function AppRouter() {
  // Prefetch the heavy routes once the landing page has painted. Uses
  // requestIdleCallback where available so we don't compete with hero
  // animations; otherwise a short timeout. These imports resolve to already-
  // cached promises by the time the user clicks "Open the playground".
  useEffect(() => {
    const prefetch = () => {
      void import('./pages/PlaygroundPage')
      void import('./pages/ClaimsPage')
      void import('./App')
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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <p className="animate-pulse text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/playground" element={<PlaygroundPageLazy />} />
        <Route path="/claims" element={<ClaimsPageLazy />} />
        <Route path="/app" element={<AppLazy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
