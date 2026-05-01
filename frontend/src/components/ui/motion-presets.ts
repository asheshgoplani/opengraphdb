import type { Transition } from 'framer-motion'

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
