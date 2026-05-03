import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from './components/layout/RouteErrorBoundary'

// S6: embedded-app build target — playground/claims/app shell.
// LandingPage is intentionally excluded; the marketing site lives in a
// separate bundle (see MarketingRouter.tsx). Default route is /playground
// because that's where a user who just ran `ogdb demo` should land.
const PlaygroundPageLazy = lazy(() => import('./pages/PlaygroundPage'))
const ClaimsPageLazy = lazy(() => import('./pages/ClaimsPage'))

// `<Navigate to="/playground" replace />` calls history.replaceState and
// drops the search + hash on the way to the destination. That ate the
// proto/3d-graph eval flag (`?graph=3d`) on `/?graph=3d` and would now
// also eat the c14 legacy-2D opt-out (`?graph=2d`). Forwarding both
// preserves shareable links and keeps the module-level
// graphModeFlag.ts capture meaningful for users who hit `/`.
function NavigatePreservingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}

export function AppShellRouter() {
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
          <Route path="/" element={<NavigatePreservingQuery to="/playground" />} />
          <Route path="/playground" element={<PlaygroundPageLazy />} />
          <Route path="/claims" element={<ClaimsPageLazy />} />
          <Route path="/app" element={<NavigatePreservingQuery to="/playground" />} />
          <Route path="*" element={<NavigatePreservingQuery to="/playground" />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}
