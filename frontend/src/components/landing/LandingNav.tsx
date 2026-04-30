import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/utils'

const SECTION_LINKS = [
  { href: '#showcase', label: 'Showcase' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#get-started', label: 'Get started' },
]

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.05c-3.2.7-3.88-1.37-3.88-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-border/60 bg-background/85 text-foreground backdrop-blur-md'
          : 'border-b border-transparent bg-transparent text-foreground'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-base font-semibold tracking-tight"
        >
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              scrolled ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-foreground',
            )}
          >
            <Logo size={18} aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-medium tracking-tight">
            OpenGraphDB
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Landing sections">
          {SECTION_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                scrolled
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-foreground/85 hover:text-foreground'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={
              scrolled
                ? ''
                : 'text-foreground/85 hover:bg-muted/60 hover:text-foreground'
            }
          >
            <a
              href="https://github.com/asheshgoplani/opengraphdb"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="OpenGraphDB on GitHub"
            >
              <GithubMark className="h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            className={
              scrolled
                ? 'shadow-sm'
                : 'bg-white text-slate-900 shadow-sm hover:bg-white/90'
            }
          >
            <Link to="/playground">Playground</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
