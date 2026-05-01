import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import { RouteErrorBoundary } from './components/layout/RouteErrorBoundary'

// S6: marketing build target — public landing page only.
// All non-/ paths redirect to / so a curious crawler hitting /playground
// or /app on the public site gets bounced back to the marketing surface
// rather than seeing a blank app shell or a 404.
export function MarketingRouter() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteErrorBoundary>
  )
}
