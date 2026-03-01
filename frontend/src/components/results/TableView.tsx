import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { GraphData, GraphNode } from '@/types/graph'

interface TableViewProps {
  graphData: GraphData
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function TableView({ graphData }: TableViewProps) {
  // Collect all unique property keys across nodes
  const propertyKeys = useMemo(() => {
    const keys = new Set<string>()
    graphData.nodes.forEach((node) => {
      Object.keys(node.properties).forEach((k) => keys.add(k))
    })
    return Array.from(keys)
  }, [graphData.nodes])

  const columns = useMemo<ColumnDef<GraphNode>[]>(() => {
    const cols: ColumnDef<GraphNode>[] = [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ getValue }) => String(getValue()),
      },
      {
        id: 'labels',
        header: 'Labels',
        cell: ({ row }) => row.original.labels.join(', '),
      },
    ]
    propertyKeys.forEach((key) => {
      cols.push({
        id: `prop_${key}`,
        header: key,
        cell: ({ row }) => formatCellValue(row.original.properties[key]),
      })
    })
    return cols
  }, [propertyKeys])

  const table = useReactTable({
    data: graphData.nodes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 20 },
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  No results
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
