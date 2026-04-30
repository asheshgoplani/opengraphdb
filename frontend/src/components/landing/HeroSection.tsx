import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppBackdrop } from '@/components/layout/AppBackdrop'
import { Button } from '@/components/ui/button'
import { ClaimsBadge } from './ClaimsBadge'
import { HeroGraphBackground } from './HeroGraphBackground'
import { useSectionInView } from './useSectionInView'

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

const STATS = [
  { value: 'Rust', label: 'single-binary core' },
  { value: 'Cypher', label: 'openCypher TCK gated' },
  { value: 'MCP', label: 'JSON-RPC tool surface' },
]

export function HeroSection() {
  const { ref, isInView } = useSectionInView<HTMLDivElement>({ threshold: 0.1 })

  return (
    <section
      className="dark relative isolate overflow-hidden bg-background text-foreground"
      aria-labelledby="hero-heading"
    >
      {/* Slice-12: shared AppBackdrop so the hero carries the same
          gradient + dot-grid + vignette depth as the playground canvas. */}
      <AppBackdrop variant="hero" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_30%,hsla(40,95%,62%,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_85%,hsla(20,80%,55%,0.12),transparent_70%)]" />

      <HeroGraphBackground />

      {/* Slice-13: radial dim band sitting behind the hero headline so the
          italic "built for the way" line never competes with constellation
          particles drifting through the same vertical strip. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[32%] z-[5] h-[34vh]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 62% 100% at 50% 50%, hsla(24, 40%, 4%, 0.58), hsla(24, 40%, 4%, 0.28) 55%, transparent 90%)',
        }}
      />

      <div
        ref={ref}
        data-testid="hero-content"
        className="relative z-20 mx-auto flex min-h-[88vh] max-w-6xl flex-col items-center justify-center px-6 py-28 text-center sm:py-36"
      >
        <div
          className={`mb-8 flex flex-wrap items-center justify-center gap-2 ${
            isInView ? 'animate-reveal-up' : 'opacity-0'
          }`}
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs uppercase tracking-[0.18em] text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
            v0.3.0&nbsp;·&nbsp;open source&nbsp;·&nbsp;Apache-2.0&nbsp;·&nbsp;single-file
          </p>
          <ClaimsBadge />
        </div>

        <h1
          id="hero-heading"
          className={`font-display text-balance text-5xl font-light leading-[0.95] text-white sm:text-7xl lg:text-[5.5rem] ${
            isInView ? 'animate-reveal-up animate-delay-100 animate-fill-both' : 'opacity-0'
          }`}
        >
          The single-file graph DB
          <br />
          <span className="italic text-white/85">Rust devs</span>
          <br />
          <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">
            reach for.
          </span>
        </h1>

        <p
          className={`mx-auto mt-10 max-w-2xl text-pretty text-base leading-relaxed text-white/65 sm:text-lg ${
            isInView ? 'animate-reveal-up animate-delay-200 animate-fill-both' : 'opacity-0'
          }`}
        >
          OpenGraphDB embeds in your Rust, Python, or Node app — or runs as a
          single{' '}
          <code className="rounded bg-white/10 px-1.5 py-px font-mono text-[0.85em] text-white/85">
            ogdb serve
          </code>{' '}
          process. Cypher queries, MVCC, WAL, and an MCP surface for AI tools.
          No JVM. No separate search index to keep in sync.
        </p>

        <div
          className={`mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 ${
            isInView ? 'animate-reveal-up animate-delay-300 animate-fill-both' : 'opacity-0'
          }`}
        >
          <Button
            asChild
            size="lg"
            className="group min-w-52 bg-white text-slate-900 shadow-lg shadow-amber-500/25 hover:bg-white/90"
          >
            <Link to="/playground">
              Open the playground
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="min-w-44 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <a
              href="https://github.com/asheshgoplani/opengraphdb"
              target="_blank"
              rel="noreferrer noopener"
            >
              <GithubMark className="mr-1.5 h-4 w-4" />
              View on GitHub
            </a>
          </Button>
        </div>

        <dl
          className={`mt-16 grid w-full max-w-xl grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] ${
            isInView ? 'animate-reveal-up animate-delay-400 animate-fill-both' : 'opacity-0'
          }`}
        >
          {STATS.map((stat) => (
            <div
              key={stat.value}
              className="bg-card/80 px-4 py-5 text-left sm:px-6"
            >
              <dt className="font-display text-2xl font-medium text-white sm:text-3xl">
                {stat.value}
              </dt>
              <dd className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/50">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-background"
        aria-hidden="true"
      />
    </section>
  )
}
