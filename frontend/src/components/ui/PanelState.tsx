import { AlertTriangle, Loader2, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'

type Intent = 'empty' | 'loading' | 'error'

export interface PanelStateProps {
  intent: Intent
  title: string
  description?: string
  hint?: string
  icon?: typeof Workflow
  className?: string
  children?: React.ReactNode
}

// Shared empty / loading / error visual language — matches the landing sidebar
// "Verified benchmark" card and /app ResultsEmptyState: dark bordered surface,
// Fraunces title, text-muted-foreground secondary copy, cyan/amber/red accent.
export function PanelState({ intent, title, description, hint, icon, className, children }: PanelStateProps) {
  const accent =
    intent === 'loading'
      ? 'border-accent/50 bg-accent/10 text-accent'
      : intent === 'error'
        ? 'border-destructive/50 bg-destructive/10 text-destructive'
        : 'border-border/60 bg-background/50 text-accent'

  const Icon = icon ?? (intent === 'error' ? AlertTriangle : intent === 'loading' ? Loader2 : Workflow)

  return (
    <div
      data-testid={`panel-state-${intent}`}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border px-5 py-6 text-center',
        accent,
        className,
      )}
    >
      <div
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/70',
          intent === 'loading' && 'animate-pulse',
        )}
      >
        <Icon className={cn('h-5 w-5', intent === 'loading' && 'animate-spin')} />
      </div>
      <p className="font-serif text-[15px] leading-tight tracking-tight text-foreground">{title}</p>
      {description && (
        <p className="max-w-md text-[11.5px] leading-snug text-muted-foreground">{description}</p>
      )}
      {hint && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">{hint}</p>
      )}
      {children}
    </div>
  )
}
