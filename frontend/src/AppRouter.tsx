import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'))
const ClaimsPage = lazy(() => import('./pages/ClaimsPage'))
const App = lazy(() => import('./App'))

export function AppRouter() {
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
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/claims" element={<ClaimsPage />} />
        <Route path="/app" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
