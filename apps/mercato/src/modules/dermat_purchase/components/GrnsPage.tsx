"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, FlaskConical, PackageCheck, PackageX, Search, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { GRN_STATUS, day, type GrnStatus, type GrnView } from './shared'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { Button } from '@open-mercato/ui/primitives/button'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { downloadCsv, fetchAllPages, fetchDetails } from '../../dermat_products/lib/csvExport'

type View = 'under_test' | 'approved' | 'rejected' | 'all'
type Row = { id: string; code: string; poId: string | null; poCode: string | null; vendorName: string; grnDate: string; invoiceNo: string | null; status: GrnStatus; lineCount: number; passed: number; failed: number; items: string[] }

export function GrnsPage() {
  const t = useT()
  const granted = useGranted()
  const [view, setView] = React.useState<View>('under_test')
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
        return apiCall<{ items: Row[]; total: number }>(`/api/dermat_purchase/grns?${params.toString()}`, undefined, { fallback: { items: [], total: 0 } })
      }
      const [list, ...totals] = await Promise.all([query(view, 100), ...(['under_test', 'approved', 'rejected'] as View[]).map((target) => query(target, 1))])
      if (cancelled) return
      setItems(list.result?.items ?? [])
      setCounts({ under_test: totals[0].result?.total, approved: totals[1].result?.total, rejected: totals[2].result?.total })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [view, search])

  const tiles: Array<{ view: View; label: string; icon: React.ReactNode; tone: string }> = [
    { view: 'under_test', label: t('dermat_purchase.grns.underTest', 'Under QC test'), icon: <FlaskConical className="h-4 w-4" />, tone: 'bg-status-warning-bg text-status-warning-icon' },
    { view: 'approved', label: t('dermat_purchase.grns.approved', 'Approved stock'), icon: <PackageCheck className="h-4 w-4" />, tone: 'bg-status-success-bg text-status-success-icon' },
    { view: 'rejected', label: t('dermat_purchase.grns.rejected', 'Rejected'), icon: <PackageX className="h-4 w-4" />, tone: 'bg-status-error-bg text-status-error-icon' },
  ]

  const exportGrns = async () => {
    const params = new URLSearchParams({ view })
    if (search.trim()) params.set('search', search.trim())
    const list = await fetchAllPages<{ id: string }>(`/api/dermat_purchase/grns?${params.toString()}`)
    const grns = await fetchDetails<GrnView>(list.map((row) => row.id), (id) => `/api/dermat_purchase/grns?id=${encodeURIComponent(id)}`)
    const rows = grns.flatMap((grn) => grn.lines.map((line) => ({ grn, line })))
    downloadCsv(`grn-${view}`, [
      { header: 'GRN', value: (row) => row.grn.code },
      { header: 'GRN date', value: (row) => row.grn.grnDate },
      { header: 'PO', value: (row) => row.grn.poCode ?? 'Without PO' },
      { header: 'Vendor', value: (row) => row.grn.vendorName },
      { header: 'Invoice no.', value: (row) => row.grn.invoiceNo ?? '' },
      { header: 'Invoice date', value: (row) => row.grn.invoiceDate ?? '' },
      { header: 'Material ID', value: (row) => row.line.code ?? '' },
      { header: 'Material', value: (row) => row.line.title },
      { header: 'Store', value: (row) => row.line.store },
      { header: 'Qty', value: (row) => row.line.quantity },
      { header: 'Unit', value: (row) => row.line.unit },
      { header: 'Rate (₹)', value: (row) => row.line.rate ?? '' },
      { header: 'Batch / lot', value: (row) => row.line.lotNumber },
      { header: 'Mfg date', value: (row) => row.line.mfgDate ?? '' },
      { header: 'Expiry', value: (row) => row.line.expiryDate ?? '' },
      { header: 'QC', value: (row) => row.line.qcStatus },
      { header: 'QC no.', value: (row) => row.line.check?.code ?? '' },
      { header: 'Returned to vendor', value: (row) => row.line.returnedQty },
      { header: 'Received by', value: (row) => row.grn.receivedByName ?? '' },
    ], rows)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_purchase.eyebrow', 'Purchase')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_purchase.grns.title', 'Goods receiving (GRN)')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{t('dermat_purchase.grns.lede', 'Every delivery, against a PO or without one. Stock stays "under QC test" until QC approves the batch; rejected batches go back to the vendor.')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {granted.has('dermat_purchase.receive') ? (
                <Button asChild variant="outline">
                  <Link href="/backend/purchase/grns/direct">
                    <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_purchase.grns.direct', 'Receive without PO')}
                  </Link>
                </Button>
              ) : null}
              <ExportButton onExport={exportGrns} />
            </div>
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiles.map((tile) => {
              const active = view === tile.view
              return (
                <button
                  key={tile.view}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(active ? 'all' : tile.view)}
                  className={cn('flex items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'border-primary ring-1 ring-primary' : 'border-border')}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                    {tile.icon}
                  </span>
                  <span>
                    <span className="block text-2xl font-bold leading-none tabular-nums">{counts[tile.view] ?? '–'}</span>
                    <span className="mt-1 block text-sm font-medium">{tile.label}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="grn-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_purchase.grns.search', 'GRN, PO, vendor or invoice no.')} />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState className="py-14" variant="subtle" icon={<Truck className="h-5 w-5" aria-hidden="true" />} title={t('dermat_purchase.grns.empty', 'No goods received here')} description={t('dermat_purchase.grns.emptyHint', 'Receive goods from an approved purchase order.')} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((row) => (
                  <li key={row.id}>
                    <Link href={`/backend/purchase/grns/${row.id}`} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
                      <div className="md:col-span-3">
                        <p className="font-mono text-sm font-semibold">{row.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {day(row.grnDate)} · {row.poCode ?? t('dermat_purchase.grn.withoutPo', 'Without PO')}
                        </p>
                      </div>
                      <div className="min-w-0 md:col-span-5">
                        <p className="truncate text-sm font-medium">{row.vendorName}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.items.join(' · ')}</p>
                      </div>
                      <p className="text-xs text-muted-foreground md:col-span-2">
                        {t('dermat_purchase.grns.qcCount', '{passed} of {total} approved', { passed: row.passed, total: row.lineCount })}
                        {row.failed ? ` · ${row.failed} rejected` : ''}
                      </p>
                      <div className="flex items-center justify-between gap-2 md:col-span-2 md:justify-end">
                        <StatusBadge variant={GRN_STATUS[row.status].variant} dot>
                          {GRN_STATUS[row.status].label}
                        </StatusBadge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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

export default GrnsPage
