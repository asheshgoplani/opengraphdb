import { GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const SECTION_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#use-cases', label: 'Use Cases' },
  { href: '#get-started', label: 'Get Started' },
]

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg"
        >
          <span className="rounded-md bg-primary/15 p-1 text-primary">
            <GitBranch className="h-4 w-4" />
          </span>
          OpenGraphDB
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Landing sections">
          {SECTION_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/playground">Playground</Link>
          </Button>
          <Button asChild size="sm" className="shadow-sm">
            <Link to="/app">Open App</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
