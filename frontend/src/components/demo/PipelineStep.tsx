import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface PipelineStepProps {
  icon: LucideIcon
  title: string
  description: string
  stepNumber: number
  isLast?: boolean
  animationDelay: string
  isInView: boolean
}

export function PipelineStep({
  icon: Icon,
  title,
  description,
  stepNumber,
  isLast = false,
  animationDelay,
  isInView,
}: PipelineStepProps) {
  return (
    <>
      {/* Step card */}
      <div
        className={cn(
          'flex min-w-[140px] flex-1 flex-col items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-4 text-center transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5',
          'animate-fill-both',
          isInView ? cn('animate-slide-up', animationDelay) : 'opacity-0'
        )}
        style={{
          borderTop: '2px solid',
          borderImage: `linear-gradient(to right, hsl(var(--primary) / 0.4), hsl(var(--primary))) 1`,
        }}
      >
        {/* Step number badge */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {stepNumber}
        </div>

        {/* Icon */}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>

        {/* Text */}
        <div>
          <p className="text-base font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Connector (only between steps, not after last) */}
      {!isLast && (
        <>
          {/* Desktop horizontal connector */}
          <div className="hidden shrink-0 items-center lg:flex">
            <div
              className={cn(
                'h-[2px] w-8 transition-opacity duration-700',
                isInView ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                background:
                  'linear-gradient(to right, hsl(var(--primary) / 0.4), hsl(var(--primary) / 0.2))',
                backgroundSize: '200% 100%',
                animation: isInView ? 'flow 2s ease-in-out infinite' : 'none',
              }}
            />
            {/* Arrow */}
            <svg
              className={cn(
                'h-3 w-3 shrink-0 text-primary/40 transition-opacity duration-700',
                isInView ? 'opacity-100' : 'opacity-0'
              )}
              viewBox="0 0 12 12"
              fill="currentColor"
            >
              <path d="M8.293 6L3.646 1.354a.5.5 0 01.708-.708l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L8.293 6z" />
            </svg>
          </div>

          {/* Mobile vertical connector */}
          <div className="flex justify-center lg:hidden">
            <div className="h-6 w-[2px] bg-primary/20" />
          </div>
        </>
      )}
    </>
  )
}
