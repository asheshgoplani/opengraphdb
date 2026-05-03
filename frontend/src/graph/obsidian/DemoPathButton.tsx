// Phase-3 STORY — always-on bottom-right "Show a path" pill.
//
// Permanent UI on the playground graph (not a transient overlay). Click
// runs `pickDemoEndpoints(graphData)` to choose two reasonable endpoints
// — densest Genre + densest Movie connected by 1+ hops — and dispatches
// the resulting node-id path to the parent.
//
// `pickDemoEndpoints` lives in its own file so this component can stay
// component-only (react-refresh requirement).

import { Sparkles } from 'lucide-react'
import type { GraphData } from '@/types/graph'
import { TRAVERSAL_ACCENT } from './palette'
import { pickDemoEndpoints } from './pickDemoEndpoints'

interface Props {
  graphData: GraphData
  onDispatchPath: (nodeIds: Array<string | number>) => void
}

export function DemoPathButton({ graphData, onDispatchPath }: Props) {
  const handleClick = () => {
    const path = pickDemoEndpoints(graphData)
    if (path) onDispatchPath(path)
  }
  return (
    <button
      type="button"
      data-testid="obsidian-demo-path-pill"
      onClick={handleClick}
      className="pointer-events-auto absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur transition hover:bg-background"
      style={{
        color: TRAVERSAL_ACCENT,
        borderColor: TRAVERSAL_ACCENT,
      }}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      Show a path
    </button>
  )
}
