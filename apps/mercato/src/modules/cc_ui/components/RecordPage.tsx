"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { PageLoading } from './PageLoading'
import { DOCUMENT_KIND_LABEL, type DocumentLink } from '../lib/links'

export type Tone = 'good' | 'warn' | 'bad'

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-status-success-text',
  warn: 'text-status-warning-text',
  bad: 'text-status-error-text',
}

export function RecordState({ error, loadingLabel }: { error: string | null; loadingLabel: string }) {
  return (
    <Page>
      <PageBody>{error ? <ErrorMessage label={error} /> : <PageLoading label={loadingLabel} />}</PageBody>
    </Page>
  )
}

export function RecordPage({
  back,
  overline,
  title,
  mono = true,
  badges,
  meta,
  actions,
  alert,
  chain,
  facts,
  children,
}: {
  back: { href: string; label: string }
  overline?: React.ReactNode
  title: React.ReactNode
  mono?: boolean
  badges?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  alert?: React.ReactNode
  chain?: React.ReactNode
  facts?: Fact[]
  children: React.ReactNode
}) {
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {back.label}
            </Link>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
          <article className="overflow-hidden rounded-md border border-foreground/70 bg-card shadow-sm">
            <header className="bg-foreground px-4 py-3 text-background sm:px-5">
              {overline ? <p className="font-mono text-overline font-semibold uppercase tracking-widest opacity-70">{overline}</p> : null}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className={cn('break-words text-2xl font-bold tracking-tight', mono && 'font-mono')}>{title}</h1>
                {badges}
              </div>
              {meta ? <p className="mt-1 text-xs opacity-70">{meta}</p> : null}
            </header>
            {facts && facts.length ? <LedgerFacts facts={facts} /> : null}
          </article>
          {alert}
          {chain}
          {children}
        </div>
      </PageBody>
    </Page>
  )
}

export function RecordColumns({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4">{side}</aside>
    </div>
  )
}

export type Fact = { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }

function LedgerFacts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-2 border-t border-foreground/70 sm:grid-cols-3 lg:grid-cols-6">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 border-b border-r border-border px-4 py-2.5">
          <dt className="truncate font-mono text-overline uppercase tracking-widest text-muted-foreground">{fact.label}</dt>
          <dd className={cn('mt-0.5 truncate font-mono text-lg font-semibold tabular-nums', fact.tone && TONE_TEXT[fact.tone])}>{fact.value}</dd>
          {fact.hint ? <dd className="truncate text-xs text-muted-foreground">{fact.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

export function Panel({
  title,
  icon: Icon,
  count,
  action,
  flush = false,
  className,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  count?: number | null
  action?: React.ReactNode
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('overflow-hidden rounded-md border border-border bg-card shadow-sm', className)}>
      <header className="flex items-center justify-between gap-3 border-b-2 border-foreground/70 px-3 py-2">
        <h2 className="flex min-w-0 items-center gap-2 font-mono text-overline font-semibold uppercase tracking-widest">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          <span className="truncate">{title}</span>
          {typeof count === 'number' ? <span className="tabular-nums text-muted-foreground">· {count}</span> : null}
        </h2>
        {action ? <div className="shrink-0 text-xs print:hidden">{action}</div> : null}
      </header>
      <div className={flush ? '' : 'p-3'}>{children}</div>
    </section>
  )
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted-foreground">{children}</p>
}

export type LinkRow = {
  key: string
  href?: string | null
  primary: React.ReactNode
  secondary?: React.ReactNode
  value?: React.ReactNode
  valueHint?: React.ReactNode
  badge?: React.ReactNode
}

export function LinkRows({ rows, empty }: { rows: LinkRow[]; empty: React.ReactNode }) {
  if (!rows.length) return <PanelEmpty>{empty}</PanelEmpty>
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.primary}</span>
              {row.secondary ? <span className="block truncate text-xs text-muted-foreground">{row.secondary}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {row.value !== undefined ? (
                <span className="text-right">
                  <span className="block font-mono tabular-nums">{row.value}</span>
                  {row.valueHint ? <span className="block text-xs text-muted-foreground">{row.valueHint}</span> : null}
                </span>
              ) : null}
              {row.badge}
              {row.href ? <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" aria-hidden="true" /> : null}
            </span>
          </>
        )
        return (
          <li key={row.key} className="odd:bg-card even:bg-muted/30">
            {row.href ? (
              <Link href={row.href} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-3 px-3 py-2">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function FieldList({ fields, columns = 2 }: { fields: Array<[string, React.ReactNode]>; columns?: 1 | 2 }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-8', columns === 2 && 'sm:grid-cols-2')}>
      {fields.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-dashed border-border py-1.5 text-sm last:border-b-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-right font-mono font-medium tabular-nums">{value === null || value === undefined || value === '' ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DocLink({ doc }: { doc: DocumentLink | null }) {
  const t = useT()
  if (!doc) return <span className="text-muted-foreground">—</span>
  const kind = t(`cc_ui.document.${doc.kind}`, DOCUMENT_KIND_LABEL[doc.kind])
  const text = doc.label ? `${kind} ${doc.label}` : kind
  return doc.href ? (
    <Link href={doc.href} className="font-medium underline-offset-2 hover:underline">
      {text}
    </Link>
  ) : (
    <span>{text}</span>
  )
}

export type HistoryEntry = { key: string; label: React.ReactNode; note?: React.ReactNode; by?: string | null; at: string }

export function HistoryPanel({ entries, footer }: { entries: HistoryEntry[]; footer?: React.ReactNode }) {
  const t = useT()
  return (
    <Panel title={t('cc_ui.history', 'History')} count={entries.length} flush>
      {entries.length ? (
        <ol className="divide-y divide-border text-sm">
          {entries.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 even:bg-muted/30">
              <span className="min-w-0">
                <span className="font-medium">{entry.label}</span>
                {entry.note ? <span className="text-muted-foreground"> · {entry.note}</span> : null}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {entry.by ?? '—'} · {formatWhen(entry.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <PanelEmpty>{t('cc_ui.noHistory', 'Nothing recorded yet.')}</PanelEmpty>
      )}
      {footer ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{footer}</p> : null}
    </Panel>
  )
}

export type ChainStep = { key: string; label: string; href?: string | null; state: 'done' | 'current' | 'next' }

export function ChainStrip({ steps }: { steps: ChainStep[] }) {
  const t = useT()
  return (
    <nav aria-label={t('cc_ui.chain', 'Where this sits in the material chain')} className="overflow-x-auto print:hidden">
      <ol className="flex min-w-max overflow-hidden rounded-md border border-foreground/70 font-mono text-xs uppercase tracking-wide">
        {steps.map((step) => {
          const cell = (
            <span
              className={cn(
                'flex h-full items-center gap-1.5 px-3 py-1.5',
                step.state === 'current' && 'bg-foreground font-semibold text-background',
                step.state === 'done' && 'bg-card text-foreground',
                step.state === 'next' && 'bg-muted/40 text-muted-foreground',
              )}
            >
              <span aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}</span>
              {step.label}
            </span>
          )
          return (
            <li key={step.key} className="border-r border-border last:border-r-0">
              {step.href && step.state !== 'current' ? (
                <Link href={step.href} className="block h-full hover:bg-muted">
                  {cell}
                </Link>
              ) : (
                cell
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export type GridColumn<Row> = { key: string; label: string; align?: 'left' | 'right'; mono?: boolean; render: (row: Row) => React.ReactNode; total?: React.ReactNode }

export function RegisterGrid<Row>({ columns, rows, rowKey, rowHref, empty, maxHeight = true }: {
  columns: Array<GridColumn<Row>>
  rows: Row[]
  rowKey: (row: Row) => string
  rowHref?: (row: Row) => string | null
  empty: React.ReactNode
  maxHeight?: boolean
}) {
  if (!rows.length) return <PanelEmpty>{empty}</PanelEmpty>
  const hasTotals = columns.some((column) => column.total !== undefined)
  return (
    <div className={cn('overflow-auto', maxHeight && 'max-h-screen')}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted font-mono text-overline uppercase tracking-widest text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cn('whitespace-nowrap border-b-2 border-foreground/70 px-3 py-2 font-semibold', column.align === 'right' ? 'text-right' : 'text-left')}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row) ?? null
            return (
              <tr key={rowKey(row)} className="border-b border-border even:bg-muted/30 hover:bg-muted/50">
                {columns.map((column, index) => (
                  <td key={column.key} className={cn('whitespace-nowrap px-3 py-2', column.align === 'right' && 'text-right font-mono tabular-nums', column.mono && 'font-mono text-xs')}>
                    {index === 0 && href ? (
                      <Link href={href} className="font-medium text-primary underline-offset-2 hover:underline">
                        {column.render(row)}
                      </Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {hasTotals ? (
          <tfoot className="sticky bottom-0 border-t-4 border-double border-foreground/70 bg-muted font-mono font-semibold">
            <tr>
              {columns.map((column) => (
                <td key={column.key} className={cn('whitespace-nowrap px-3 py-2', column.align === 'right' && 'text-right tabular-nums')}>
                  {column.total ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
