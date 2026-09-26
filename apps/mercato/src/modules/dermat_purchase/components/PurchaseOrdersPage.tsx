"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, FilePen, FileText, PackageCheck, Plus, Search, Stamp, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PO_STATUS, day, money, type PoStatus } from './shared'

type View = 'pending_approval' | 'open' | 'draft' | 'received' | 'all'
type Row = {
  id: string
  code: string
  vendorName: string
  poDate: string
  expectedDate: string | null
  status: PoStatus
  total: number
  lineCount: number
  receivedPercent: number
  items: string[]
  createdByName: string | null
  orderRefs: Array<{ orderId: string; orderNo: string }>
}

export function PurchaseOrdersPage() {
  const t = useT()
  const [view, setView] = React.useState<View>('open')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<Row[] | null>(null)
  const [counts, setCounts] = React.useState<Partial<Record<View, number>>>({})

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    const handle = window.setTimeout(async () => {
      const query = (target: View, pageSize: number) => {
        const params = new URLSearchParams({ view: target, pageSize: String(pageSize) })
        if (search.trim()) params.set('search', search.trim())
        return apiCall<{ items: Row[]; total: number }>(`/api/dermat_purchase/orders?${params.toString()}`, undefined, { fallback: { items: [], total: 0 } })
      }
      const [list, ...totals] = await Promise.all([query(view, 100), ...(['pending_approval', 'open', 'draft', 'received'] as View[]).map((target) => query(target, 1))])
      if (cancelled) return
      setItems(list.result?.items ?? [])
      setCounts({ pending_approval: totals[0].result?.total, open: totals[1].result?.total, draft: totals[2].result?.total, received: totals[3].result?.total })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [view, search])

  const tiles: Array<{ view: View; label: string; hint: string; icon: React.ReactNode; tone: string }> = [
    { view: 'pending_approval', label: t('dermat_purchase.list.pending', 'Waiting for approval'), hint: t('dermat_purchase.list.pendingHint', 'Check rate and quantity, then approve'), icon: <Stamp className="h-4 w-4" />, tone: 'bg-status-warning-bg text-status-warning-icon' },
    { view: 'open', label: t('dermat_purchase.list.open', 'Open with vendor'), hint: t('dermat_purchase.list.openHint', 'Approved, goods still to come'), icon: <Truck className="h-4 w-4" />, tone: 'bg-status-info-bg text-status-info-icon' },
    { view: 'draft', label: t('dermat_purchase.list.draft', 'Drafts'), hint: t('dermat_purchase.list.draftHint', 'Not sent for approval yet'), icon: <FilePen className="h-4 w-4" />, tone: 'bg-muted text-muted-foreground' },
    { view: 'received', label: t('dermat_purchase.list.closed', 'Received or cancelled'), hint: t('dermat_purchase.list.closedHint', 'Everything arrived'), icon: <PackageCheck className="h-4 w-4" />, tone: 'bg-status-success-bg text-status-success-icon' },
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_purchase.eyebrow', 'Purchase')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_purchase.list.title', 'Purchase orders')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_purchase.list.lede', 'Raise a PO, get it approved, then receive the goods against it. Received material stays "under QC test" until QC approves it.')}
              </p>
            </div>
            <Link href="/backend/purchase/orders/new">
              <Button type="button">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_purchase.list.new', 'New purchase order')}
              </Button>
            </Link>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((tile) => {
              const active = view === tile.view
              return (
                <button
                  key={tile.view}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(active ? 'all' : tile.view)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                    {tile.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-2xl font-bold leading-none tabular-nums">{counts[tile.view] ?? '–'}</span>
                    <span className="mt-1 block text-sm font-medium">{tile.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tile.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="po-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_purchase.list.search', 'PO number or vendor')} />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState
                className="py-14"
                variant="subtle"
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title={t('dermat_purchase.list.empty', 'No purchase orders here')}
                description={t('dermat_purchase.list.emptyHint', 'Raise one here, or from a short material on the planning board.')}
              />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((row) => (
                  <li key={row.id}>
                    <Link href={`/backend/purchase/orders/${row.id}`} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
                      <div className="min-w-0 md:col-span-4">
                        <p className="font-mono text-sm font-semibold">{row.code}</p>
                        <p className="truncate text-sm">{row.vendorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {day(row.poDate)}
                          {row.orderRefs.length ? ` · for ${row.orderRefs.map((ref) => ref.orderNo).join(', ')}` : ''}
                        </p>
                      </div>
                      <p className="min-w-0 truncate text-sm text-muted-foreground md:col-span-3">
                        {row.items.join(', ')}
                        {row.lineCount > row.items.length ? ` +${row.lineCount - row.items.length}` : ''}
                      </p>
                      <div className="md:col-span-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t('dermat_purchase.list.received', 'Received')}</span>
                          <span className="tabular-nums">{row.receivedPercent}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-input">
                          <div className={cn('h-full rounded-full', row.receivedPercent >= 100 ? 'bg-status-success-icon' : 'bg-accent-indigo')} style={{ width: `${Math.min(100, row.receivedPercent)}%` }} />
                        </div>
                        {row.expectedDate ? <p className="mt-1 text-xs text-muted-foreground">{t('dermat_purchase.list.due', 'Due {date}', { date: day(row.expectedDate) })}</p> : null}
                      </div>
                      <div className="flex items-center justify-between gap-3 md:col-span-3 md:justify-end">
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{money(row.total)}</p>
                          <StatusBadge variant={PO_STATUS[row.status].variant} dot>
                            {PO_STATUS[row.status].label}
                          </StatusBadge>
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

export default PurchaseOrdersPage
