interface AIDownloadProgressProps {
  message: string
  percent: number
}

export function AIDownloadProgress({ message, percent }: AIDownloadProgressProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent))

  return (
    <div className="mx-3 mb-3 rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
          {Math.round(clampedPercent)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        ~1.6GB one-time download. Model runs locally in your browser.
      </p>
    </div>
  )
}
