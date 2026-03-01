import { getDatasetList, type DatasetKey } from '@/data/datasets'

interface DatasetSwitcherProps {
  activeDataset: DatasetKey
  onSwitch: (key: DatasetKey) => void
}

export function DatasetSwitcher({ activeDataset, onSwitch }: DatasetSwitcherProps) {
  const datasets = getDatasetList()
  const active = datasets.find((dataset) => dataset.key === activeDataset) ?? datasets[0]

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Dataset
      </label>
      <select
        data-testid="dataset-switcher"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        value={activeDataset}
        onChange={(event) => onSwitch(event.target.value as DatasetKey)}
      >
        {datasets.map((dataset) => (
          <option key={dataset.key} value={dataset.key}>
            {dataset.name}
          </option>
        ))}
      </select>
      <p className="text-xs leading-relaxed text-muted-foreground">{active?.description}</p>
    </div>
  )
}
