export const tokens = {
  duration: {
    fast: 'var(--duration-fast)',
    base: 'var(--duration-base)',
    slow: 'var(--duration-slow)',
  },
  easing: {
    out: 'var(--ease-out)',
    inOut: 'var(--ease-in-out)',
  },
  radius: {
    sm: 'calc(var(--radius) - 4px)',
    md: 'calc(var(--radius) - 2px)',
    lg: 'var(--radius)',
    xl: 'calc(var(--radius) + 4px)',
    full: '9999px',
  },
  font: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    display: 'Fraunces, "Source Serif 4", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  bloomOpacity: 'var(--bloom-opacity)',
} as const
