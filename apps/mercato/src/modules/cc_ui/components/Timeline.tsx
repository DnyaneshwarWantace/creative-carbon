"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, History } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Panel, PanelEmpty } from './RecordPage'

type Kind = 'change' | 'stage' | 'document' | 'correction' | 'comment' | 'attachment' | 'system'
type Change = { field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null; money?: boolean }
type Item = { id: string; at: string; action: string; kind: Kind; summary: string | null; reason: string | null; changes: Change[]; links: Array<{ type: string; id: string; label: string | null }>; source: string; by: string | null; legacy: boolean }
type Page = { total: number; page: number; totalPages: number; counts: Record<string, number>; items: Item[] }

const KIND_LABEL: Record<Kind, string> = {
  change: 'Changes',
  stage: 'Steps',
  document: 'Documents',
  correction: 'Corrections',
  comment: 'Comments',
  attachment: 'Files',
  system: 'System',
}

const KIND_DOT: Record<Kind, string> = {
  change: 'bg-primary',
  stage: 'bg-status-success-icon',
  document: 'bg-status-info-icon',
  correction: 'bg-status-error-icon',
  comment: 'bg-muted-foreground',
  attachment: 'bg-status-info-icon',
  system: 'bg-muted-foreground',
}

const SOURCE_LABEL: Record<string, string> = { upload: 'Excel upload', phone: 'Phone', job: 'Automatic', api: 'API' }

const LINK_HREF: Record<string, (id: string) => string> = {
  order: (id) => `/backend/orders/${id}`,
  lot: (id) => `/backend/stock/lots/${id}`,
  invoice: (id) => `/backend/accounts/invoices/${id}`,
  payment: (id) => `/backend/accounts/payments/${id}`,
  po: (id) => `/backend/purchase/orders/${id}`,
  grn: (id) => `/backend/purchase/grns/${id}`,
  customer: (id) => `/backend/customers/companies/${id}`,
  vendor: (id) => `/backend/cc_vendors/${id}`,
}

function value(input: string | number | boolean | null): string {
  if (input === null || input === '') return '—'
  if (typeof input === 'boolean') return input ? 'Yes' : 'No'
  if (typeof input === 'number') return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(input)
  return input
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function Timeline({ type, id, refreshKey, title, footer }: { type: string; id: string; refreshKey?: unknown; title?: string; footer?: React.ReactNode }) {
  const t = useT()
  const [kind, setKind] = React.useState<Kind | null>(null)
  const [items, setItems] = React.useState<Item[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (nextPage: number, append: boolean) => {
      const params = new URLSearchParams({ type, id, page: String(nextPage), pageSize: '30' })
      if (kind) params.set('kind', kind)
      const call = await apiCall<Page & { error?: string }>(`/api/cc_audit/activity?${params.toString()}`)
      if (!call.ok || !call.result) {
        setError(call.status === 403 ? t('cc_ui.timeline.forbidden', 'You cannot see the history of this record.') : t('cc_ui.timeline.error', 'Could not load the history.'))
        setItems([])
        return
      }
      const result = call.result
      setError(null)
      setItems((prev) => (append && prev ? [...prev, ...result.items] : result.items))
      setPage(result.page)
      setTotalPages(result.totalPages)
      setTotal(result.total)
      if (!kind) setCounts(result.counts)
    },
    [type, id, kind, t],
  )

  React.useEffect(() => {
    setItems(null)
    void load(1, false)
  }, [load, refreshKey])

  const days = React.useMemo(() => {
    const groups: Array<{ day: string; items: Item[] }> = []
    for (const item of items ?? []) {
      const day = dayLabel(item.at)
      const last = groups[groups.length - 1]
      if (last && last.day === day) last.items.push(item)
      else groups.push({ day, items: [item] })
    }
    return groups
  }, [items])

  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((entry) => counts[entry])

  return (
    <Panel title={title ?? t('cc_ui.timeline.title', 'History')} icon={History} count={kind ? total : Object.values(counts).reduce((sum, value) => sum + value, 0)} flush>
      {kinds.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2" role="group" aria-label={t('cc_ui.timeline.filter', 'Show')}>
          {[null, ...kinds].map((entry) => (
            <button
              key={entry ?? 'all'}
              type="button"
              aria-pressed={kind === entry}
              onClick={() => setKind(entry)}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs', kind === entry ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
            >
              {entry ? t(`cc_ui.timeline.kind.${entry}`, KIND_LABEL[entry]) : t('cc_ui.timeline.all', 'All')}
              <span className={cn('rounded-full px-1.5 tabular-nums', kind === entry ? 'bg-primary-foreground/20' : 'bg-muted')}>{entry ? counts[entry] : Object.values(counts).reduce((sum, count) => sum + count, 0)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {items === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : error ? (
        <PanelEmpty>{error}</PanelEmpty>
      ) : !items.length ? (
        <PanelEmpty>{t('cc_ui.timeline.empty', 'Nothing recorded yet.')}</PanelEmpty>
      ) : (
        <div className="divide-y">
          {days.map((group) => (
            <section key={group.day} className="px-3 py-2">
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{group.day}</h3>
              <ol className="space-y-2.5 border-l pl-4">
                {group.items.map((item) => (
                  <li key={item.id} className="relative">
                    <span className={cn('absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card', KIND_DOT[item.kind])} aria-hidden="true" />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium">{item.summary ?? item.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.by ?? '—'} · {timeLabel(item.at)}
                        {SOURCE_LABEL[item.source] ? ` · ${t(`cc_ui.timeline.source.${item.source}`, SOURCE_LABEL[item.source])}` : ''}
                      </p>
                    </div>
                    {item.reason ? <p className={cn('text-xs', item.kind === 'correction' ? 'text-status-error-text' : 'text-muted-foreground')}>{item.kind === 'correction' ? t('cc_ui.timeline.reason', 'Reason: {reason}', { reason: item.reason }) : item.reason}</p> : null}
                    {item.changes.length ? (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {item.changes.map((change) => (
                          <li key={change.field} className="flex flex-wrap items-center gap-1">
                            <span className="text-muted-foreground">{change.label}:</span>
                            <span className="line-through decoration-muted-foreground/60">{value(change.from)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            <span className="font-medium">{value(change.to)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.links.length ? (
                      <p className="mt-1 flex flex-wrap gap-2 text-xs">
                        {item.links.map((link) =>
                          LINK_HREF[link.type] ? (
                            <Link key={`${link.type}-${link.id}`} className="text-primary hover:underline" href={LINK_HREF[link.type](link.id)}>
                              {link.label ?? link.type}
                            </Link>
                          ) : (
                            <span key={`${link.type}-${link.id}`}>{link.label ?? link.type}</span>
                          ),
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {page < totalPages ? (
            <div className="flex justify-center p-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => void load(page + 1, true)}>
                {t('cc_ui.timeline.more', 'Show older')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {footer ? <p className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</p> : null}
    </Panel>
  )
}

export default Timeline
