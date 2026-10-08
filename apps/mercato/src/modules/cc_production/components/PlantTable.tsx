"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { ViewsButton, type BuiltInView } from '../../cc_products/components/ViewsPanel'
import { Dropdown } from '../../cc_lists/components/Dropdown'

export type PlantColumn<T> = {
  key: string
  label: string
  group?: string
  align?: 'right'
  alwaysVisible?: boolean
  hidden?: boolean
  render: (row: T) => React.ReactNode
}

const PAGE_SIZES = [25, 50, 100, 0] as const

function readStored<V>(key: string, fallback: V): V {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as V) : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

export function PlantTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  rowHref,
  renderExpanded,
  builtIn,
  empty,
  toolbar,
  minWidth = 'min-w-200',
}: {
  tableId: string
  columns: Array<PlantColumn<T>>
  rows: T[]
  rowKey: (row: T) => string
  rowHref?: (row: T) => string
  renderExpanded?: (row: T) => React.ReactNode
  builtIn?: BuiltInView[]
  empty?: React.ReactNode
  toolbar?: React.ReactNode
  minWidth?: string
}) {
  const t = useT()
  const router = useRouter()
  const defaults = React.useMemo(() => columns.filter((column) => !column.hidden).map((column) => column.key), [columns])
  const [visible, setVisible] = React.useState<string[]>(defaults)
  const [pageSize, setPageSize] = React.useState<number>(50)
  const [page, setPage] = React.useState(0)
  const [expanded, setExpanded] = React.useState<string | null>(null)

  React.useEffect(() => {
    const keys = columns.map((column) => column.key)
    const stored = readStored<string[] | null>(`cc-cols:${tableId}`, null)
    if (stored) setVisible(stored.filter((key) => keys.includes(key)))
    setPageSize(readStored<number>(`cc-rows:${tableId}`, 50))
  }, [tableId, columns])

  React.useEffect(() => {
    setPage(0)
  }, [rows.length, pageSize])

  const changeColumns = (next: string[]) => {
    const forced = columns.filter((column) => column.alwaysVisible).map((column) => column.key)
    const merged = [...forced.filter((key) => !next.includes(key)), ...next]
    setVisible(merged)
    writeStored(`cc-cols:${tableId}`, merged)
  }
  const changePageSize = (value: number) => {
    setPageSize(value)
    writeStored(`cc-rows:${tableId}`, value)
  }

  const shown = visible.map((key) => columns.find((column) => column.key === key)).filter((column): column is PlantColumn<T> => Boolean(column))
  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1
  const slice = pageSize ? rows.slice(page * pageSize, page * pageSize + pageSize) : rows

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {toolbar}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t('cc_production.table.rows', 'Rows')}
          <Dropdown className="h-8 rounded-md border border-input bg-background px-1.5 text-xs" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} aria-label={t('cc_production.table.rows', 'Rows')}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size || t('cc_production.table.all', 'All')}
              </option>
            ))}
          </Dropdown>
        </label>
        <ViewsButton tableId={tableId} columns={columns.map((column) => ({ key: column.key, label: column.label, group: column.group ?? 'Columns', alwaysVisible: column.alwaysVisible }))} visible={visible} onChange={changeColumns} builtIn={builtIn} />
      </div>
      <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        {!rows.length ? (
          empty
        ) : (
          <table className={cn('w-full text-sm', minWidth)}>
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {shown.map((column) => (
                  <th key={column.key} className={cn('px-4 py-2 font-semibold', column.align === 'right' && 'text-right')}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slice.map((row) => {
                const id = rowKey(row)
                const clickable = Boolean(rowHref || renderExpanded)
                return (
                  <React.Fragment key={id}>
                    <tr
                      className={cn(clickable && 'cursor-pointer hover:bg-muted/40')}
                      onClick={() => {
                        if (renderExpanded) setExpanded(expanded === id ? null : id)
                        else if (rowHref) router.push(rowHref(row))
                      }}
                    >
                      {shown.map((column) => (
                        <td key={column.key} className={cn('px-4 py-2', column.align === 'right' && 'text-right tabular-nums')}>
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                    {renderExpanded && expanded === id ? (
                      <tr>
                        <td colSpan={shown.length} className="bg-muted/30 px-6 py-2">
                          {renderExpanded(row)}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      {pageSize && rows.length > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>{t('cc_production.table.range', '{from}–{to} of {total}', { from: page * pageSize + 1, to: Math.min(rows.length, (page + 1) * pageSize), total: rows.length })}</span>
          <Button type="button" variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t('cc_production.table.previous', 'Previous page')}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label={t('cc_production.table.next', 'Next page')}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
