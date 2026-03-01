interface QueryErrorProps {
  error: Error | null
}

export function QueryError({ error }: QueryErrorProps) {
  if (!error) return null

  return (
    <div className="mx-3 mt-0 mb-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
      {error.message}
    </div>
  )
}
