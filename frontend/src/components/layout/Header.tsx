export function Header() {
  return (
    <header className="h-12 border-b bg-card flex items-center justify-between px-4">
      <div className="font-semibold text-lg">OpenGraphDB</div>
      <div className="flex items-center gap-2">
        {/* ConnectionStatus, ThemeToggle, SettingsDialog slots filled in Plan 05 */}
      </div>
    </header>
  )
}
