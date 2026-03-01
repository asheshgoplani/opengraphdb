import { LandingNav } from '@/components/landing/LandingNav'
import { HeroSection } from '@/components/landing/HeroSection'
import { ShowcaseSection } from '@/components/landing/ShowcaseSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { GettingStartedSection } from '@/components/landing/GettingStartedSection'

export default function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <LandingNav />

      <main>
        <HeroSection />
        <ShowcaseSection />
        <FeaturesSection />
        <GettingStartedSection />
      </main>

      <footer className="border-t border-border/80 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <p className="text-sm text-muted-foreground">&copy; {year} OpenGraphDB</p>
          <p className="text-sm text-muted-foreground">Built for graph-native workloads.</p>
        </div>
      </footer>
    </div>
  )
}
