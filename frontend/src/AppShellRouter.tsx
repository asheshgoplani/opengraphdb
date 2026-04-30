import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

// S6: embedded-app build target — playground/claims/app shell.
// LandingPage is intentionally excluded; the marketing site lives in a
// separate bundle (see MarketingRouter.tsx). Default route is /playground
// because that's where a user who just ran `ogdb demo` should land.
const PlaygroundPageLazy = lazy(() => import('./pages/PlaygroundPage'))
const ClaimsPageLazy = lazy(() => import('./pages/ClaimsPage'))

export function AppShellRouter() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <p className="animate-pulse text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/playground" replace />} />
        <Route path="/playground" element={<PlaygroundPageLazy />} />
        <Route path="/claims" element={<ClaimsPageLazy />} />
        <Route path="/app" element={<Navigate to="/playground" replace />} />
        <Route path="*" element={<Navigate to="/playground" replace />} />
      </Routes>
    </Suspense>
  )
}
