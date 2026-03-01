interface QueryErrorProps {
  error: Error | null
}

export function QueryError({ error }: QueryErrorProps) {
  if (!error) return null

  return (
    <div className="mx-3 mt-0 mb-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
      {error.message}
    </div>
  )
}
