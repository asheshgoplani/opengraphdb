// Phase-3 STORY — DOM step counter overlay.
//
// Renders one of three states:
//   playing   — "Step N / K"
//   completed — "Path complete ✓" + Replay pill
//   idle      — null (nothing on screen)
//
// Positioned above the demo button (bottom-right) so the two pills line
// up vertically. Uses sacred TRAVERSAL_ACCENT for the badge text/border
// — only allowed because this file is one of the cinematic surfaces in
// the check-token-sacred-blue.sh allowlist.

import { TRAVERSAL_ACCENT } from './palette'

interface Props {
  isPlaying: boolean
  completed: boolean
  step: number
  total: number
  onReplay?: () => void
}

export function StepCounterBadge({
  isPlaying,
  completed,
  step,
  total,
  onReplay,
}: Props) {
  if (!isPlaying && !completed) return null

  const text = completed ? 'Path complete ✓' : `Step ${step} / ${total}`

  return (
    <div
      data-testid="obsidian-step-counter"
      className="pointer-events-none absolute bottom-16 right-3 z-20 flex items-center gap-2"
    >
      <div
        className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium tabular-nums shadow-md backdrop-blur"
        style={{
          color: TRAVERSAL_ACCENT,
          borderColor: TRAVERSAL_ACCENT,
        }}
      >
        {text}
      </div>
      {completed && onReplay ? (
        <button
          data-testid="obsidian-replay-pill"
          type="button"
          onClick={onReplay}
          className="pointer-events-auto rounded-full border bg-background/90 px-3 py-1 text-xs font-medium shadow-md backdrop-blur transition hover:bg-background"
          style={{
            color: TRAVERSAL_ACCENT,
            borderColor: TRAVERSAL_ACCENT,
          }}
        >
          Replay
        </button>
      ) : null}
    </div>
  )
}
