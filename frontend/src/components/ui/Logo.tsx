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
        <line x1={32} y1={14} x2={14} y2={46} />
        <line x1={32} y1={14} x2={50} y2={46} />
        <line x1={14} y1={46} x2={50} y2={46} />
        <circle cx={32} cy={14} r={6} fill="currentColor" stroke="none" />
        <circle cx={14} cy={46} r={5} fill="currentColor" stroke="none" />
        <circle cx={50} cy={46} r={5} fill="currentColor" stroke="none" />
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
      <line x1={32} y1={14} x2={14} y2={46} />
      <line x1={32} y1={14} x2={50} y2={46} />
      <line x1={14} y1={46} x2={50} y2={46} />
      <circle cx={32} cy={14} r={6} fill="currentColor" stroke="none" />
      <circle cx={14} cy={46} r={5} fill="currentColor" stroke="none" />
      <circle cx={50} cy={46} r={5} fill="currentColor" stroke="none" />
    </svg>
  )
}
