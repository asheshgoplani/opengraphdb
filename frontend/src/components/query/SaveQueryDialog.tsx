import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useQueryHistoryStore } from '@/stores/queryHistory'
import { useQueryStore } from '@/stores/query'

export function SaveQueryDialog() {
  const currentQuery = useQueryStore((s) => s.currentQuery)
  const saveQuery = useQueryHistoryStore((s) => s.saveQuery)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const handleSave = () => {
    const trimmedName = name.trim()
    const trimmedQuery = currentQuery.trim()

    if (!trimmedName || !trimmedQuery) return

    saveQuery(trimmedName, trimmedQuery)
    setName('')
    setOpen(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName('')
    }
    setOpen(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={!currentQuery.trim()}
          title="Save query"
          className="h-9 gap-1 text-xs"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Save
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Query</DialogTitle>
          <DialogDescription>
            Give this query a name so you can find it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., All Person nodes"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              }
            }}
            autoFocus
          />
          <div className="rounded-md bg-muted p-2">
            <code className="line-clamp-3 text-xs text-muted-foreground">
              {currentQuery}
            </code>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
