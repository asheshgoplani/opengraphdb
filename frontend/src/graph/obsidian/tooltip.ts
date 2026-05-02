// Hover-tooltip body picker (POLISH #2). Kept separate from the React
// component so the property-selection logic is unit-testable without a DOM.

export const TOOLTIP_PROPERTY_KEYS = [
  'name',
  'title',
  'displayName',
  'description',
  'type',
  'category',
] as const

export const TOOLTIP_MAX_PROPS = 2
const TOOLTIP_VALUE_MAX_LEN = 40

export function formatTooltipValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') {
    return v.length > TOOLTIP_VALUE_MAX_LEN
      ? `${v.slice(0, TOOLTIP_VALUE_MAX_LEN - 1)}…`
      : v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

export function pickTooltipProps(
  properties: Record<string, unknown> | undefined,
): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (!properties) return out
  const seen = new Set<string>()
  for (const k of TOOLTIP_PROPERTY_KEYS) {
    if (out.length >= TOOLTIP_MAX_PROPS) break
    const fmt = formatTooltipValue(properties[k])
    if (fmt && !seen.has(k)) {
      out.push([k, fmt])
      seen.add(k)
    }
  }
  return out
}
