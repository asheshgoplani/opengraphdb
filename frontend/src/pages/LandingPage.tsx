import { LandingNav } from '@/components/landing/LandingNav'
import { HeroSection } from '@/components/landing/HeroSection'
import { SampleQueryPanel } from '@/components/landing/SampleQueryPanel'
import { ShowcaseSection } from '@/components/landing/ShowcaseSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { GettingStartedSection } from '@/components/landing/GettingStartedSection'
import { BenchmarkStrip } from '@/components/landing/BenchmarkStrip'

export default function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <LandingNav />

      <main>
        <HeroSection />
        <SampleQueryPanel />
        <ShowcaseSection />
        <FeaturesSection />
        <GettingStartedSection />
        <BenchmarkStrip />
      </main>

      <footer className="border-t border-border/80 bg-background py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <p className="font-display text-sm text-muted-foreground">
            &copy; {year} OpenGraphDB
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Built for graph-native workloads
          </p>
        </div>
      </footer>
    </div>
  )
}
