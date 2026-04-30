import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
  variant?: 'mark' | 'lockup'
  'aria-label'?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export function Logo({ className, size = 24, variant = 'mark', ...rest }: LogoProps) {
  const ariaHiddenRaw = rest['aria-hidden']
  const isHidden = ariaHiddenRaw === true || ariaHiddenRaw === 'true'
  const a11yProps = isHidden
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': rest['aria-label'] ?? 'OpenGraphDB' }
  if (variant === 'lockup') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 360 64"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        height={size}
        className={cn('inline-block', className)}
        {...a11yProps}
        data-logo="opengraphdb-lockup"
      >
        <path d="M60 32 L46 7.75 L18 7.75 L4 32 L18 56.25 L46 56.25 Z" />
        <g strokeWidth={1.5}>
          <line x1={32} y1={16} x2={18} y2={40} />
          <line x1={32} y1={16} x2={46} y2={40} />
          <line x1={18} y1={40} x2={46} y2={40} />
        </g>
        <circle cx={32} cy={16} r={3} fill="currentColor" stroke="none" />
        <circle cx={18} cy={40} r={2.5} fill="currentColor" stroke="none" />
        <circle cx={46} cy={40} r={2.5} fill="currentColor" stroke="none" />
        <text
          x={76}
          y={44}
          fontFamily='ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'
          fontSize={32}
          fontWeight={500}
          letterSpacing={-1}
          fill="currentColor"
          stroke="none"
        >
          opengraphdb
        </text>
      </svg>
    )
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      {...a11yProps}
      data-logo="opengraphdb-mark"
    >
      <path d="M60 32 L46 7.75 L18 7.75 L4 32 L18 56.25 L46 56.25 Z" />
      <g strokeWidth={1.5}>
        <line x1={32} y1={16} x2={18} y2={40} />
        <line x1={32} y1={16} x2={46} y2={40} />
        <line x1={18} y1={40} x2={46} y2={40} />
      </g>
      <circle cx={32} cy={16} r={3} fill="currentColor" stroke="none" />
      <circle cx={18} cy={40} r={2.5} fill="currentColor" stroke="none" />
      <circle cx={46} cy={40} r={2.5} fill="currentColor" stroke="none" />
    </svg>
  )
}
