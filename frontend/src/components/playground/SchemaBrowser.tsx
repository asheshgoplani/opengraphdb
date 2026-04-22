import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Tag, Link as LinkIcon, Hash } from 'lucide-react'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'
import { cn } from '@/lib/utils'

export interface SchemaBrowserProps {
  graphData: GraphData
  selectedLabel: string | null
  ontologyMode: boolean
  onSelectLabel: (label: string | null) => void
  onToggleOntology: (next: boolean) => void
}

interface LabelEntry {
  label: string
  count: number
  propertyKeys: string[]
  parents: string[]
  children: string[]
}

interface EdgeTypeEntry {
  type: string
  count: number
  propertyKeys: string[]
}

const ONTOLOGY_ROOT_LABELS = new Set(['Class', 'owl:Class', 'rdfs:Class'])

function collectPropertyKeys(items: Array<{ properties: Record<string, unknown> }>): string[] {
  const keys = new Set<string>()
  for (const item of items) {
    for (const key of Object.keys(item.properties ?? {})) {
      if (key.startsWith('_')) continue
      keys.add(key)
    }
  }
  return Array.from(keys).sort()
}

function inferHierarchy(nodes: GraphNode[], links: GraphEdge[]): Map<string, { parents: string[]; children: string[] }> {
  const parents = new Map<string, Set<string>>()
  const children = new Map<string, Set<string>>()

  const nodeById = new Map<string | number, GraphNode>()
  for (const node of nodes) nodeById.set(node.id, node)

  for (const link of links) {
    if (link.type !== 'SUBCLASS_OF' && link.type !== 'rdfs:subClassOf' && link.type !== 'subClassOf') continue
    const source = typeof link.source === 'object' ? link.source : nodeById.get(link.source)
    const target = typeof link.target === 'object' ? link.target : nodeById.get(link.target)
    if (!source || !target) continue
    const childLabel = source.labels?.[0]
    const parentLabel = target.labels?.[0]
    if (!childLabel || !parentLabel) continue
    const ps = parents.get(childLabel) ?? new Set<string>()
    ps.add(parentLabel)
    parents.set(childLabel, ps)
    const cs = children.get(parentLabel) ?? new Set<string>()
    cs.add(childLabel)
    children.set(parentLabel, cs)
  }

  const result = new Map<string, { parents: string[]; children: string[] }>()
  const allLabels = new Set<string>([...parents.keys(), ...children.keys()])
  for (const label of allLabels) {
    result.set(label, {
      parents: Array.from(parents.get(label) ?? []).sort(),
      children: Array.from(children.get(label) ?? []).sort(),
    })
  }
  return result
}

export function buildSchemaSummary(graphData: GraphData): {
  labels: LabelEntry[]
  edgeTypes: EdgeTypeEntry[]
  allPropertyKeys: string[]
} {
  const hierarchy = inferHierarchy(graphData.nodes, graphData.links)

  const byLabel = new Map<string, GraphNode[]>()
  for (const node of graphData.nodes) {
    const label = node.labels?.[0] ?? 'unlabeled'
    const bucket = byLabel.get(label) ?? []
    bucket.push(node)
    byLabel.set(label, bucket)
  }

  const labels: LabelEntry[] = Array.from(byLabel.entries())
    .map(([label, bucket]) => ({
      label,
      count: bucket.length,
      propertyKeys: collectPropertyKeys(bucket),
      parents: hierarchy.get(label)?.parents ?? [],
      children: hierarchy.get(label)?.children ?? [],
    }))
    .sort((a, b) => b.count - a.count)

  const byEdgeType = new Map<string, GraphEdge[]>()
  for (const edge of graphData.links) {
    const bucket = byEdgeType.get(edge.type) ?? []
    bucket.push(edge)
    byEdgeType.set(edge.type, bucket)
  }

  const edgeTypes: EdgeTypeEntry[] = Array.from(byEdgeType.entries())
    .map(([type, bucket]) => ({
      type,
      count: bucket.length,
      propertyKeys: collectPropertyKeys(bucket),
    }))
    .sort((a, b) => b.count - a.count)

  const allPropertyKeys = Array.from(
    new Set([
      ...labels.flatMap((l) => l.propertyKeys),
      ...edgeTypes.flatMap((e) => e.propertyKeys),
    ]),
  ).sort()

  return { labels, edgeTypes, allPropertyKeys }
}

export function SchemaBrowser({
  graphData,
  selectedLabel,
  ontologyMode,
  onSelectLabel,
  onToggleOntology,
}: SchemaBrowserProps) {
  const [labelsOpen, setLabelsOpen] = useState(true)
  const [edgesOpen, setEdgesOpen] = useState(true)
  const [propsOpen, setPropsOpen] = useState(false)
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null)

  const summary = useMemo(() => buildSchemaSummary(graphData), [graphData])

  const hasOntology =
    summary.labels.some((l) => ONTOLOGY_ROOT_LABELS.has(l.label) || l.parents.length > 0)

  const isEmpty = summary.labels.length === 0 && summary.edgeTypes.length === 0

  if (isEmpty) {
    return (
      <section
        role="tree"
        aria-label="Schema"
        data-testid="schema-browser-empty"
        className="rounded-lg border border-dashed border-white/15 bg-muted/20 px-3 py-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
      >
        <p className="font-serif text-[13px] leading-tight text-white/85">Schema will appear here</p>
        <p className="mt-1 text-[10.5px] leading-snug text-white/50">
          Load a dataset or drag a .ttl onto the canvas to populate labels, relationships, and
          property keys.
        </p>
      </section>
    )
  }

  return (
    <section
      role="tree"
      aria-label="Schema"
      className="rounded-lg border border-white/10 bg-muted/30 px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-cyan-300" />
          <p className="font-serif text-[13px] tracking-tight text-white/90">Schema</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleOntology(!ontologyMode)}
          title={
            hasOntology
              ? 'Toggle ontology rendering (owl:Class hubs, properties as edges)'
              : 'Dataset has no rdfs:subClassOf edges — toggle still styles class-like labels'
          }
          className={cn(
            'rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-all duration-200',
            ontologyMode
              ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100 shadow-[0_0_8px_rgba(34,211,238,0.35)]'
              : 'border-white/15 bg-transparent text-white/55 hover:border-white/30 hover:text-white/80',
          )}
        >
          Ontology
        </button>
      </div>

      <div className="space-y-1.5 text-[12px]">
        <div
          role="treeitem"
          aria-label="Labels"
          aria-expanded={labelsOpen}
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => setLabelsOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setLabelsOpen((v) => !v)
            }
          }}
        >
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-white/75 hover:bg-white/5">
            {labelsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Tag className="h-3 w-3 text-indigo-300" />
            <span className="flex-1 font-mono uppercase tracking-[0.12em] text-[10px] text-white/65">
              Labels
            </span>
            <span className="font-mono text-[10px] text-white/45">{summary.labels.length}</span>
          </div>
        </div>
        {labelsOpen && (
          <ul className="ml-3 space-y-0.5 border-l border-white/10 pl-2" role="group">
            {summary.labels.map((entry) => {
              const isSelected = selectedLabel === entry.label
              const isExpanded = expandedLabel === entry.label
              return (
                <li key={entry.label} role="treeitem" aria-selected={isSelected} aria-expanded={isExpanded} data-testid="schema-label-node">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLabel(isSelected ? null : entry.label)
                      setExpandedLabel(isExpanded ? null : entry.label)
                    }}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left transition-colors',
                      isSelected
                        ? 'bg-cyan-500/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
                        : 'text-white/75 hover:bg-white/5 hover:text-white/95',
                    )}
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForIndex(summary.labels.indexOf(entry)) }}
                    />
                    <span className="flex-1 truncate font-medium">{entry.label}</span>
                    <span className="font-mono text-[10px] text-white/45">{entry.count}</span>
                  </button>
                  {isExpanded && (
                    <div
                      data-testid="schema-property-list"
                      className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2 text-[11px]"
                    >
                      {entry.parents.length > 0 && (
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                          subClassOf: <span className="text-cyan-300/80">{entry.parents.join(', ')}</span>
                        </p>
                      )}
                      {entry.children.length > 0 && (
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                          parent of: <span className="text-cyan-300/80">{entry.children.join(', ')}</span>
                        </p>
                      )}
                      {entry.propertyKeys.length === 0 ? (
                        <p className="text-white/40 italic">No properties</p>
                      ) : (
                        entry.propertyKeys.map((key) => (
                          <div key={key} className="flex items-center gap-1 text-white/60">
                            <Hash className="h-2.5 w-2.5 text-white/35" />
                            <span className="font-mono">{key}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div
          role="treeitem"
          aria-label="Edge types"
          aria-expanded={edgesOpen}
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => setEdgesOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setEdgesOpen((v) => !v)
            }
          }}
        >
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-white/75 hover:bg-white/5">
            {edgesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <LinkIcon className="h-3 w-3 text-emerald-300" />
            <span className="flex-1 font-mono uppercase tracking-[0.12em] text-[10px] text-white/65">
              Edge types
            </span>
            <span className="font-mono text-[10px] text-white/45">{summary.edgeTypes.length}</span>
          </div>
        </div>
        {edgesOpen && (
          <ul className="ml-3 space-y-0.5 border-l border-white/10 pl-2" role="group">
            {summary.edgeTypes.map((entry) => (
              <li key={entry.type} role="treeitem" className="flex items-center gap-1.5 rounded px-1 py-0.5 text-white/70">
                <span className="h-[1px] w-3 bg-emerald-400/60" />
                <span className="flex-1 truncate font-mono text-[11px]">{entry.type}</span>
                <span className="font-mono text-[10px] text-white/45">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}

        <div
          role="treeitem"
          aria-label="Property keys"
          aria-expanded={propsOpen}
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => setPropsOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setPropsOpen((v) => !v)
            }
          }}
        >
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-white/75 hover:bg-white/5">
            {propsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Hash className="h-3 w-3 text-amber-300" />
            <span className="flex-1 font-mono uppercase tracking-[0.12em] text-[10px] text-white/65">
              Property keys
            </span>
            <span className="font-mono text-[10px] text-white/45">{summary.allPropertyKeys.length}</span>
          </div>
        </div>
        {propsOpen && (
          <ul className="ml-3 space-y-0.5 border-l border-white/10 pl-2 text-[11px]" role="group">
            {summary.allPropertyKeys.map((key) => (
              <li key={key} className="flex items-center gap-1 px-1 py-0.5 font-mono text-white/60">
                <Hash className="h-2.5 w-2.5 text-white/35" />
                {key}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedLabel && (
        <p className="mt-3 rounded border border-cyan-400/30 bg-cyan-500/5 px-2 py-1.5 text-[10px] text-cyan-100/90">
          Filtering canvas to <span className="font-mono">{selectedLabel}</span>. Click the label again to clear.
        </p>
      )}
    </section>
  )
}

const LABEL_PALETTE = [
  '#818cf8', '#f472b6', '#fbbf24', '#34d399',
  '#60a5fa', '#a78bfa', '#fb923c', '#2dd4bf',
  '#e879f9', '#38bdf8', '#a3e635', '#fb7185',
]

function colorForIndex(i: number): string {
  return LABEL_PALETTE[((i % LABEL_PALETTE.length) + LABEL_PALETTE.length) % LABEL_PALETTE.length]
}
