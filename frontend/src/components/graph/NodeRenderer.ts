export const LABEL_COLORS = [
  '#818cf8',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#a78bfa',
  '#fb923c',
  '#2dd4bf',
  '#e879f9',
  '#38bdf8',
  '#a3e635',
  '#fb7185',
]

export function getLabelColor(
  label: string,
  labelIndex: Map<string, number>
): string {
  if (!labelIndex.has(label)) {
    labelIndex.set(label, labelIndex.size)
  }
  return LABEL_COLORS[labelIndex.get(label)! % LABEL_COLORS.length] ?? LABEL_COLORS[0]!
}
