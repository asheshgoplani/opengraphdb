import { ArrowRightLeft, Database, Key, RefreshCw, Tag } from 'lucide-react'
import { useSchemaQuery } from '@/api/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { getSchemaSectionItems } from './schema-utils'

type SectionConfig = {
  id: 'labels' | 'relationships' | 'properties'
  title: string
  icon: typeof Tag
  key: 'labels' | 'relationshipTypes' | 'propertyKeys'
  emptyLabel: string
}

const schemaSections: SectionConfig[] = [
  {
    id: 'labels',
    title: 'Node Labels',
    icon: Tag,
    key: 'labels',
    emptyLabel: 'No node labels found.',
  },
  {
    id: 'relationships',
    title: 'Relationship Types',
    icon: ArrowRightLeft,
    key: 'relationshipTypes',
    emptyLabel: 'No relationship types found.',
  },
  {
    id: 'properties',
    title: 'Property Keys',
    icon: Key,
    key: 'propertyKeys',
    emptyLabel: 'No property keys found.',
  },
]

export function SchemaPanel() {
  const { data, isFetching, isError, error, refetch } = useSchemaQuery()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Schema Browser">
          <Database className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 overflow-y-auto">
        <div className="flex h-full flex-col gap-4 pt-4">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>Schema</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                title="Refresh schema"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>
            </div>
            <SheetDescription>
              Browse node labels, relationship types, and property keys detected from the
              connected database.
            </SheetDescription>
          </SheetHeader>

          {isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Failed to load schema.
              {error instanceof Error && error.message ? ` ${error.message}` : ''}
            </div>
          ) : null}

          <Accordion
            type="multiple"
            defaultValue={['labels', 'relationships', 'properties']}
            className="w-full"
          >
            {schemaSections.map((section) => {
              const items = getSchemaSectionItems(data, section.key)
              const Icon = section.icon

              return (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>
                    <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{section.title}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {items.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{section.emptyLabel}</p>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((item) => (
                          <li key={item} className="rounded-sm bg-muted/30 px-2 py-1 text-sm">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  )
}
