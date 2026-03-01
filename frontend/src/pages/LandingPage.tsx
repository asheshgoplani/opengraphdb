import { Link } from 'react-router-dom'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { GettingStartedSection } from '@/components/landing/GettingStartedSection'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="text-base font-semibold sm:text-lg">
            OpenGraphDB
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/playground">Playground</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/app">Open App</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <HeroSection />
        <FeaturesSection />
        <GettingStartedSection />
      </main>

      <footer className="border-t py-8">
        <p className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground sm:px-6">
          &copy; {year} OpenGraphDB. Built for graph-native workloads.
        </p>
      </footer>
    </div>
  )
}
