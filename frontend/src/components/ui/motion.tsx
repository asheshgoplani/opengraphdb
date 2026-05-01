import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'
import { PANEL_MOTION, PANEL_TRANSITION } from './motion-presets'

export { PANEL_MOTION, PANEL_TRANSITION, CARD_HOVER_DURATION_MS } from './motion-presets'

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
