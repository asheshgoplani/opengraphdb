import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/stores/settings'
import { Settings } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'

export function SettingsDialog() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const resultLimit = useSettingsStore((s) => s.resultLimit)
  const setServerUrl = useSettingsStore((s) => s.setServerUrl)
  const setResultLimit = useSettingsStore((s) => s.setResultLimit)

  const [open, setOpen] = useState(false)
  const [localUrl, setLocalUrl] = useState(serverUrl)
  const [localLimit, setLocalLimit] = useState(String(resultLimit))

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setLocalUrl(serverUrl)
      setLocalLimit(String(resultLimit))
    }
    setOpen(isOpen)
  }

  const handleSave = () => {
    setServerUrl(localUrl.trim() || 'http://localhost:8080')
    const limit = parseInt(localLimit, 10)
    if (!isNaN(limit) && limit > 0) {
      setResultLimit(limit)
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure backend connectivity and query result limits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-2">
            <p className="mb-1 text-xs text-muted-foreground">Connection</p>
            <ConnectionStatus />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="server-url"
              className="text-sm font-medium leading-none"
            >
              Server URL
            </label>
            <Input
              id="server-url"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="result-limit"
              className="text-sm font-medium leading-none"
            >
              Result Limit
            </label>
            <Input
              id="result-limit"
              type="number"
              value={localLimit}
              onChange={(e) => setLocalLimit(e.target.value)}
              placeholder="500"
              min="1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
