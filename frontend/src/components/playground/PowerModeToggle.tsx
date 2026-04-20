import { motion } from 'framer-motion'
import { Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD_HOVER_DURATION_MS } from '@/components/ui/motion'

export interface PowerModeToggleProps {
  isActive: boolean
  onToggle: (next: boolean) => void
  className?: string
}

// Pill toggle — reveals the CypherEditorPanel inline on /playground so guided-query
// users aren't overwhelmed, but power users can drop into free-form Cypher without
// navigating away to /app.
export function PowerModeToggle({ isActive, onToggle, className }: PowerModeToggleProps) {
  return (
    <motion.button
      type="button"
      role="button"
      aria-pressed={isActive}
      aria-label="Power mode"
      onClick={() => onToggle(!isActive)}
      whileHover={{ y: -1 }}
      whileTap={{ y: 0 }}
      transition={{ duration: CARD_HOVER_DURATION_MS / 1000 }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-serif text-[12px] leading-none tracking-tight transition-all duration-200',
        isActive
          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.28)]'
          : 'border-white/15 bg-transparent text-white/65 hover:border-white/30 hover:text-white',
        className,
      )}
    >
      <Terminal className={cn('h-3 w-3', isActive ? 'text-cyan-200' : 'text-white/55')} />
      Power mode
      <span
        className={cn(
          'ml-1 rounded-full border px-1.5 font-mono text-[9px] uppercase tracking-[0.14em]',
          isActive ? 'border-cyan-300/50 text-cyan-200' : 'border-white/20 text-white/45',
        )}
      >
        {isActive ? 'on' : 'off'}
      </span>
    </motion.button>
  )
}
