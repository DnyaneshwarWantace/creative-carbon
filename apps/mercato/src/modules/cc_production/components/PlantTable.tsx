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
  total?: React.ReactNode
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="checkbox"]'

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
      {rows.length ? (
        <div className="space-y-2 md:hidden">
          {slice.map((row) => {
            const id = rowKey(row)
            const clickable = Boolean(rowHref || renderExpanded)
            const [head, ...rest] = shown
            return (
              <article
                key={id}
                className={cn('rounded-xl border bg-card p-3.5 shadow-xs', clickable && 'cursor-pointer active:bg-muted/60')}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest(INTERACTIVE)) return
                  if (renderExpanded) setExpanded(expanded === id ? null : id)
                  else if (rowHref) router.push(rowHref(row))
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-sm font-semibold">{head ? head.render(row) : null}</div>
                  {clickable ? <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', renderExpanded && expanded === id && 'rotate-90')} aria-hidden="true" /> : null}
                </div>
                {rest.length ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {rest.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="truncate text-overline uppercase tracking-wider text-muted-foreground">{column.label}</dt>
                        <dd className={cn('min-w-0 break-words text-sm', column.align === 'right' && 'font-mono tabular-nums')}>{column.render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {renderExpanded && expanded === id ? <div className="mt-3 border-t pt-3">{renderExpanded(row)}</div> : null}
              </article>
            )
          })}
          {shown.some((column) => column.total !== undefined) ? (
            <div className="rounded-xl border-2 border-foreground/70 bg-muted p-3.5">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {shown
                  .filter((column) => column.total !== undefined && column.total !== null)
                  .map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="truncate text-overline uppercase tracking-wider text-muted-foreground">Σ {column.label}</dt>
                      <dd className="font-mono text-sm font-semibold tabular-nums">{column.total}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="md:hidden">{empty}</div>
      )}
      <section className="hidden max-h-screen overflow-auto rounded-md border border-foreground/70 bg-card shadow-sm md:block">
        {!rows.length ? (
          empty
        ) : (
          <table className={cn('w-full text-sm', minWidth)}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted text-left font-mono text-overline uppercase tracking-widest text-muted-foreground">
                {shown.map((column) => (
                  <th key={column.key} className={cn('whitespace-nowrap border-b-2 border-foreground/70 px-3 py-2 font-semibold', column.align === 'right' && 'text-right')}>
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
                      className={cn('even:bg-muted/30', clickable && 'cursor-pointer hover:bg-muted/60')}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest(INTERACTIVE)) return
                        if (renderExpanded) setExpanded(expanded === id ? null : id)
                        else if (rowHref) router.push(rowHref(row))
                      }}
                    >
                      {shown.map((column) => (
                        <td key={column.key} className={cn('px-3 py-2', column.align === 'right' && 'text-right font-mono tabular-nums')}>
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
            {shown.some((column) => column.total !== undefined) ? (
              <tfoot className="sticky bottom-0 border-t-4 border-double border-foreground/70 bg-muted font-mono font-semibold">
                <tr>
                  {shown.map((column, index) => (
                    <td key={column.key} className={cn('whitespace-nowrap px-3 py-2', column.align === 'right' && 'text-right tabular-nums')}>
                      {column.total ?? (index === 0 ? 'Σ' : null)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
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
