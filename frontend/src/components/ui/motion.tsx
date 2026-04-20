import { motion, type HTMLMotionProps, type Transition } from 'framer-motion'
import { forwardRef } from 'react'

// Shared premium motion preset — fade + subtle y-translate, 280ms ease-out.
// Every panel mount across /playground, /app, semantic / schema / temporal / MCP / perf
// uses this preset so the tool breathes with one rhythm.
export const PANEL_TRANSITION: Transition = {
  duration: 0.28,
  ease: [0.25, 0.46, 0.45, 0.94],
}

export const PANEL_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: PANEL_TRANSITION,
}

export const CARD_HOVER_DURATION_MS = 200

type MotionPanelProps = HTMLMotionProps<'section'> & {
  'data-testid'?: string
}

export const MotionPanel = forwardRef<HTMLElement, MotionPanelProps>(function MotionPanel(
  { children, className, ...rest },
  ref,
) {
  return (
    <motion.section
      ref={ref}
      initial={PANEL_MOTION.initial}
      animate={PANEL_MOTION.animate}
      exit={PANEL_MOTION.exit}
      transition={PANEL_TRANSITION}
      className={className}
      {...rest}
    >
      {children}
    </motion.section>
  )
})

type MotionDivProps = HTMLMotionProps<'div'>

export const MotionPanelDiv = forwardRef<HTMLDivElement, MotionDivProps>(function MotionPanelDiv(
  { children, className, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={PANEL_MOTION.initial}
      animate={PANEL_MOTION.animate}
      exit={PANEL_MOTION.exit}
      transition={PANEL_TRANSITION}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
})
