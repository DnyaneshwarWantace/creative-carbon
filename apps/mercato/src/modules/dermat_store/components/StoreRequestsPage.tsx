"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, Inbox, PackageCheck, Search, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Meter, STATUS_LABEL, STATUS_VARIANT, StageIcon, StockRoute, ago, type RequestListItem, type RequestView } from './shared'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv, fetchAllPages, fetchDetails } from '../../dermat_products/lib/csvExport'

type View = 'to_issue' | 'to_receive' | 'done' | 'all'
type Mode = 'store' | 'production'

type Tile = { view: View; label: string; hint: string; icon: React.ReactNode; tone: string }

export function StoreRequestsPage({ mode = 'store' }: { mode?: Mode }) {
  const t = useT()
  const [view, setView] = React.useState<View>(mode === 'production' ? 'to_receive' : 'to_issue')
  const [store, setStore] = React.useState<'all' | 'rm' | 'pm'>('all')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<RequestListItem[] | null>(null)
  const [counts, setCounts] = React.useState<Record<View, number | null>>({ to_issue: null, to_receive: null, done: null, all: null })

  const tiles: Tile[] = [
    {
      view: 'to_issue',
      label: t('dermat_store.list.toIssue', 'To issue'),
      hint: t('dermat_store.list.toIssueHint', 'Production is waiting for the store'),
      icon: <Inbox className="h-4 w-4" aria-hidden="true" />,
      tone: 'bg-status-warning-bg text-status-warning-icon',
    },
    {
      view: 'to_receive',
      label: t('dermat_store.list.toReceive', 'Sent, not received'),
      hint: t('dermat_store.list.toReceiveHint', 'Production must confirm receipt'),
      icon: <Truck className="h-4 w-4" aria-hidden="true" />,
      tone: 'bg-status-info-bg text-status-info-icon',
    },
    {
      view: 'done',
      label: t('dermat_store.list.done', 'Done'),
      hint: t('dermat_store.list.doneHint', 'Received, used or cancelled'),
      icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
      tone: 'bg-status-success-bg text-status-success-icon',
    },
  ]
  const orderedTiles = mode === 'production' ? [tiles[1], tiles[0], tiles[2]] : tiles

  const query = React.useCallback(
    (target: View, pageSize: number) => {
      const params = new URLSearchParams({ view: target, pageSize: String(pageSize) })
      if (store !== 'all') params.set('store', store)
      if (search.trim()) params.set('search', search.trim())
      return apiCall<{ items: RequestListItem[]; total: number }>(`/api/dermat_store/requests?${params.toString()}`, undefined, { fallback: { items: [], total: 0 } })
    },
    [store, search],
  )

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    const handle = window.setTimeout(async () => {
      const [list, ...totals] = await Promise.all([query(view, 100), ...(['to_issue', 'to_receive', 'done'] as View[]).map((target) => query(target, 1))])
      if (cancelled) return
      setItems(list.result?.items ?? [])
      setCounts({ to_issue: totals[0].result?.total ?? 0, to_receive: totals[1].result?.total ?? 0, done: totals[2].result?.total ?? 0, all: null })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query, view])

  const exportRequests = async () => {
    const params = new URLSearchParams({ view })
    if (store !== 'all') params.set('store', store)
    if (search.trim()) params.set('search', search.trim())
    const list = await fetchAllPages<RequestListItem>(`/api/dermat_store/requests?${params.toString()}`)
    const requests = await fetchDetails<RequestView>(list.map((row) => row.id), (id) => `/api/dermat_store/requests?id=${encodeURIComponent(id)}`)
    const rows = requests.flatMap((request) => request.lines.map((line) => ({ request, line })))
    downloadCsv(`store-requests-${view}`, [
      { header: 'Request', value: (row) => row.request.code },
      { header: 'Date', value: (row) => row.request.createdAt.slice(0, 10) },
      { header: 'Order', value: (row) => row.request.orderNo },
      { header: 'Stage', value: (row) => row.request.stageLabel },
      { header: 'Store', value: (row) => row.request.storeLabel },
      { header: 'Status', value: (row) => STATUS_LABEL[row.request.status] ?? row.request.status },
      { header: 'Material ID', value: (row) => row.line.code ?? '' },
      { header: 'Material', value: (row) => row.line.title },
      { header: 'Unit', value: (row) => row.line.unit },
      { header: 'Required', value: (row) => row.line.required },
      { header: 'Issued', value: (row) => row.line.issued },
      { header: 'Received', value: (row) => row.line.received },
      { header: 'Used', value: (row) => row.line.used },
      { header: 'Returned', value: (row) => row.line.returned },
      { header: 'With production', value: (row) => row.line.withProduction },
      { header: 'Batches issued', value: (row) => row.line.issues.map((issue) => `${issue.lotNumber ?? ''} ${issue.quantity}`.trim()).join('; ') },
      { header: 'Requested by', value: (row) => row.request.requestedByName ?? '' },
      { header: 'Received by', value: (row) => row.request.receivedByName ?? '' },
    ], rows)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                {mode === 'production' ? t('dermat_store.list.productionEyebrow', 'Production') : t('dermat_store.list.storeEyebrow', 'RM & PM store')}
              </p>
              <h1 className="text-2xl font-bold tracking-tight">
                {mode === 'production' ? t('dermat_store.list.productionTitle', 'Material from the store') : t('dermat_store.list.title', 'Store requests')}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {mode === 'production'
                  ? t('dermat_store.list.productionLede', 'What you asked the store for, what it has sent, and what you still need to confirm as received.')
                  : t('dermat_store.list.lede', 'Production asks from the order stage. Issue by batch: stock moves to PRODUCTION at once, and the order reservation is used first.')}
              </p>
            </div>
            <ExportButton onExport={exportRequests} />
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {orderedTiles.map((tile) => {
              const active = view === tile.view
              return (
                <button
                  key={tile.view}
                  type="button"
                  onClick={() => setView(active ? 'all' : tile.view)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)}>{tile.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-2xl font-bold tabular-nums leading-none">{counts[tile.view] ?? '–'}</span>
                    <span className="mt-1 block text-sm font-medium">{tile.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tile.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl value={store} onValueChange={(value) => setStore(value as typeof store)} aria-label={t('dermat_store.list.storeFilter', 'Store')}>
              <SegmentedControlItem value="all">{t('dermat_store.list.allStores', 'All stores')}</SegmentedControlItem>
              <SegmentedControlItem value="rm">{t('dermat_store.list.rm', 'RM store')}</SegmentedControlItem>
              <SegmentedControlItem value="pm">{t('dermat_store.list.pm', 'PM store')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="store-request-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('dermat_store.list.search', 'Request or order no.')}
                className="pl-9"
              />
            </div>
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                {view === 'all' ? t('dermat_store.list.everything', 'All requests') : orderedTiles.find((tile) => tile.view === view)?.label}
              </h2>
              {items ? <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span> : null}
            </div>
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState
                className="py-14"
                variant="subtle"
                icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
                title={view === 'to_issue' ? t('dermat_store.list.emptyIssue', 'Nothing waiting for the store') : t('dermat_store.list.empty', 'No requests here')}
                description={t('dermat_store.list.emptyHint', 'Production asks for material from the Manufacturing, Filling or Packing stage of an order.')}
              />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/backend/store/requests/${item.id}`}
                      className="group grid grid-cols-1 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none md:grid-cols-12"
                    >
                      <div className="flex min-w-0 items-center gap-3 md:col-span-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                          <StageIcon stageKey={item.stageKey} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-semibold">{item.code}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.orderNo} · {item.stageLabel}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0 md:col-span-3">
                        <p className="truncate text-sm">{item.items.join(', ')}{item.lineCount > item.items.length ? ` +${item.lineCount - item.items.length}` : ''}</p>
                        <StockRoute store={item.store} className="mt-1" />
                      </div>
                      <div className="md:col-span-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t('dermat_store.list.lines', 'Lines issued')}</span>
                          <span className="tabular-nums">
                            {item.issuedLines}/{item.lineCount}
                          </span>
                        </div>
                        <Meter className="mt-1.5" value={item.issuedLines} max={item.lineCount} tone={item.issuedLines === item.lineCount ? 'success' : 'accent'} />
                      </div>
                      <div className="flex items-center justify-between gap-3 md:col-span-3 md:justify-end">
                        <div className="text-right">
                          <StatusBadge variant={STATUS_VARIANT[item.status]} dot>
                            {item.awaitingReceipt && item.status !== 'requested' ? t('dermat_store.status.awaiting', 'Sent · not received') : STATUS_LABEL[item.status]}
                          </StatusBadge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ago(item.createdAt)}
                            {item.requestedByName ? ` · ${item.requestedByName}` : ''}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

export default StoreRequestsPage
