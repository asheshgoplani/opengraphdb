import { useCallback, useState } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CodeSnippetCardProps {
  index: number
  title: string
  whyCare: string
  language: string
  code: string
  docHref: string
  className?: string
}

export function CodeSnippetCard({
  index,
  title,
  whyCare,
  language,
  code,
  docHref,
  className,
}: CodeSnippetCardProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <article
      data-testid="ai-pattern-card"
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md',
        className,
      )}
    >
      <header className="flex items-start gap-4 px-6 pt-6">
        <span
          aria-hidden="true"
          className="font-display text-4xl font-light leading-none text-muted-foreground/40"
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 space-y-2">
          <h3 className="font-display text-xl font-medium tracking-tight text-foreground sm:text-2xl">
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{whyCare}</p>
        </div>
      </header>

      <div className="relative mx-6 mt-5 overflow-hidden rounded-lg bg-background text-foreground shadow-inner">
        <div className="flex items-center justify-between border-b border-border px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>{language}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={copied ? 'Copied' : `Copy ${title} snippet`}
            className="h-7 gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              void onCopy()
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>

      <footer className="mt-5 flex items-center justify-end px-6 pb-6">
        <a
          href={docHref}
          className="inline-flex items-center gap-1 font-display text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
        >
          Read the pattern
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </footer>
    </article>
  )
}
