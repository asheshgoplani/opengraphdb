export function getResultsViewToggleClass(isActive: boolean): string {
  return isActive
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
}
