import { Film, Plane, Swords, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DatasetKey } from '@/data/datasets'

interface DemoDatasetSelectorProps {
  activeDataset: DatasetKey
  onSelect: (key: DatasetKey) => void
}

const DATASET_OPTIONS: {
  key: DatasetKey
  icon: typeof Film
  name: string
  tag: string
}[] = [
  { key: 'movielens', icon: Film, name: 'MovieLens', tag: '8K movies' },
  { key: 'airroutes', icon: Plane, name: 'Air Routes', tag: '3.5K airports' },
  { key: 'got', icon: Swords, name: 'Game of Thrones', tag: '400+ characters' },
  { key: 'wikidata', icon: Award, name: 'Nobel Prizes', tag: 'Nobel laureates' },
]

export function DemoDatasetSelector({ activeDataset, onSelect }: DemoDatasetSelectorProps) {
  return (
    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
      {DATASET_OPTIONS.map(({ key, icon: Icon, name, tag }) => {
        const isActive = key === activeDataset
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-2 text-left transition-all',
              isActive
                ? 'border-2 border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border border-border/60 bg-card/50 hover:border-primary/40 hover:bg-card/80'
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-sm font-medium', isActive ? 'text-foreground' : 'text-foreground/80')}>
                {name}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{tag}</p>
          </button>
        )
      })}
    </div>
  )
}
