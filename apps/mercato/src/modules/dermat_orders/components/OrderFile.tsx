"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Boxes, ChevronDown, Factory, FileText, FlaskConical, PackageCheck, ShoppingCart, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { stageDef, stageList } from '../lib/stages'
import { formatDate, formatQty } from './format'
import type { Order, Stage } from './types'

export type MaterialRow = {
  productId: string
  code: string | null
  title: string
  kind: string | null
  unit: string | null
  needed: number
  reserved: number
  issued: number
  withProduction: number
  used: number
  returned: number
  stillNeeded: number
  free: number
  underTest: number
  onOrder: number
  toBuy: number
  status: 'used' | 'with_production' | 'reserved' | 'partly_reserved' | 'available' | 'coming' | 'short'
  lots: Array<{ lotNumber: string; quantity: number; stage: string; request: string; at: string | null }>
  reserveMissing: number
  reserveExpiring: { lotNumber: string | null; expiresAt: string; quantity: number } | null
  reservedSince: string | null
  openPos: Array<{ id: string; code: string; open: number; expectedDate: string | null; vendorName: string }>
}

export type OrderFileData = {
  orderId: string
  open: boolean
  materials: MaterialRow[]
  summary: { total: number; used: number; withProduction: number; reserved: number; short: number; coming: number; toBuy: number; reserveProblems: number }
  missingBoms: string[]
  indents: Array<{ id: string; code: string; status: string; department: string | null }>
  purchases: Array<{ id: string; code: string; status: string; vendorName: string; poDate: string; expectedDate: string | null; total: number; lines: number; grns: Array<{ id: string; code: string; status: string; grnDate: string; invoiceNo: string | null }> }>
  storeRequests: Array<{ id: string; code: string; stageKey: string; status: string; lines: number }>
  qc: Array<{ id: string; code: string; stageKey: string | null; status: string; productTitle: string; batchNo: string | null; arNo: string | null; chemicalStatus: string; microStatus: string; chemicalBy: string | null; microBy: string | null; round: number; results: Array<{ name: string; spec: string; observation: string; test: string; inSpec: boolean | null }> }>
  invoices: Array<{ id: string; code: string; kind: string; status: string; invoiceDate: string; total: number }>
  output: Array<{ lineId: string; productId: string; title: string; ordered: number; batchNo: string | null; bulkId: string | null; bulkTitle: string | null; bulkMadeKg: number | null; bulkLeftKg: number; filled: number | null; rejected: number | null; packed: number | null; packedLocation: string | null; dispatched: number; dispatchDate: string | null; deliveredOn: string | null; fgInStore: number }>
}

export function useOrderFile(order: Order | null): OrderFileData | null {
  const [file, setFile] = React.useState<OrderFileData | null>(null)
  const version = order ? `${order.id}:${order.updatedAt ?? ''}:${order.stages.map((stage) => stage.status).join('')}` : ''
  React.useEffect(() => {
    if (!order) return
    let cancelled = false
    void apiCall<OrderFileData>(`/api/dermat_orders/orders/file?id=${encodeURIComponent(order.id)}`).then((call) => {
      if (!cancelled && call.ok && call.result) setFile(call.result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
  return file
}

const MATERIAL_STATUS: Record<MaterialRow['status'], { label: string; variant: StatusBadgeVariant }> = {
  used: { label: 'Used', variant: 'success' },
  with_production: { label: 'With production', variant: 'info' },
  reserved: { label: 'Reserved', variant: 'info' },
  partly_reserved: { label: 'Partly reserved', variant: 'warning' },
  available: { label: 'In stock, not reserved', variant: 'warning' },
  coming: { label: 'Coming (PO / QC)', variant: 'warning' },
  short: { label: 'Short', variant: 'error' },
}

const DOC_STATUS: Record<string, StatusBadgeVariant> = { approved: 'success', received: 'success', passed: 'success', issued: 'success', used: 'success', partly_received: 'warning', under_test: 'warning', pending: 'warning', pending_approval: 'warning', partly_approved: 'warning', requested: 'warning', partly_issued: 'warning', draft: 'neutral', rejected: 'error', failed: 'error', cancelled: 'neutral' }

function words(value: string): string {
  return value.replace(/_/g, ' ')
}

function Chip({ href, code, status, extra }: { href: string; code: string; status: string; extra?: string | null }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted">
      <span className="font-mono font-semibold">{code}</span>
      <StatusBadge variant={DOC_STATUS[status] ?? 'neutral'}>{words(status)}</StatusBadge>
      {extra ? <span className="text-muted-foreground">{extra}</span> : null}
    </Link>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'good' | 'warn' }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'bad' && value ? 'text-status-error-text' : tone === 'warn' && value ? 'text-status-warning-text' : tone === 'good' && value ? 'text-status-success-text' : '')}>{value}</p>
    </div>
  )
}

export function MaterialsAccount({ file, order }: { file: OrderFileData | null; order: Order }) {
  const t = useT()
  const [openRow, setOpenRow] = React.useState<string | null>(null)
  if (!file) return <p className="p-6 text-sm text-muted-foreground">{t('dermat_orders.file.loading', 'Working out materials…')}</p>
  const s = file.summary
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Tile label={t('dermat_orders.file.materials', 'Materials')} value={s.total} />
        <Tile label={t('dermat_orders.file.used', 'Used')} value={s.used} tone="good" />
        <Tile label={t('dermat_orders.file.withProduction', 'With production')} value={s.withProduction} />
        <Tile label={t('dermat_orders.file.reserved', 'Reserved')} value={s.reserved} />
        <Tile label={t('dermat_orders.file.coming', 'Coming')} value={s.coming} tone="warn" />
        <Tile label={t('dermat_orders.file.short', 'Short')} value={s.short} tone="bad" />
      </div>
      {file.missingBoms.length ? <p className="text-xs text-status-warning-text">{t('dermat_orders.view.noBomFor', 'No BOM yet for: {products}', { products: file.missingBoms.join(', ') })}</p> : null}

      <section className="overflow-hidden rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Boxes className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dermat_orders.file.materialsTitle', 'Material account for this order')}
          </h3>
          <p className="text-xs text-muted-foreground">{file.open ? t('dermat_orders.file.materialsHintOpen', 'Needed from the BOM → reserved by Planning → issued by the store (batch no.) → used in production.') : t('dermat_orders.file.materialsHintDone', 'Order finished: what was issued and used, batch by batch.')}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 text-left">{t('dermat_orders.view.material', 'Material')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.needed', 'Needed')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.reserved', 'Reserved')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.issued', 'Issued')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.usedCol', 'Used')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.returned', 'Returned')}</th>
                <th className="p-3 text-right">{t('dermat_orders.file.stillNeeded', 'Still to issue')}</th>
                <th className="p-3 text-left">{t('dermat_orders.file.status', 'Status')}</th>
                <th className="w-8 p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {file.materials.map((row) => {
                const unit = row.unit ?? ''
                const status = MATERIAL_STATUS[row.status]
                const expanded = openRow === row.productId
                return (
                  <React.Fragment key={row.productId}>
                    <tr className={cn(row.status === 'short' && 'bg-status-error-bg/50')}>
                      <td className="p-3">
                        <Link href={`/backend/products/${row.productId}`} className="font-medium hover:underline">{row.title}</Link>
                        <div className="font-mono text-xs text-muted-foreground">{row.code ?? '—'} · {row.kind === 'raw_material' ? 'RM' : 'PM'}</div>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">{formatQty(row.needed)} <span className="text-xs text-muted-foreground">{unit}</span></td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.reserved ? formatQty(row.reserved) : '—'}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.issued ? formatQty(row.issued) : '—'}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.used ? formatQty(row.used) : '—'}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{row.returned ? formatQty(row.returned) : '—'}</td>
                      <td className={cn('p-3 text-right font-mono tabular-nums', row.stillNeeded ? 'font-semibold' : 'text-muted-foreground')}>{row.stillNeeded ? formatQty(row.stillNeeded) : '—'}</td>
                      <td className="p-3">
                        <StatusBadge variant={status.variant}>{t(`dermat_orders.file.status.${row.status}`, status.label)}</StatusBadge>
                        {row.toBuy ? <div className="mt-1 text-xs text-status-error-text">{t('dermat_orders.file.toBuy', 'Buy {qty} {unit}', { qty: formatQty(row.toBuy), unit })}</div> : null}
                        {row.reserved && row.reservedSince ? <div className="mt-1 text-xs text-muted-foreground">{t('dermat_orders.file.reservedSince', 'reserved since {date}', { date: formatDate(row.reservedSince) })}</div> : null}
                        {row.reserveMissing ? <div className="mt-1 text-xs font-medium text-status-error-text">{t('dermat_orders.file.reserveMissing', '{qty} {unit} of the reserved stock is no longer in the store', { qty: formatQty(row.reserveMissing), unit })}</div> : null}
                        {row.reserveExpiring ? <div className="mt-1 text-xs font-medium text-status-warning-text">{t('dermat_orders.file.reserveExpiring', 'Reserved batch {lot} expires {date}, before it is needed', { lot: row.reserveExpiring.lotNumber ?? '—', date: formatDate(row.reserveExpiring.expiresAt) })}</div> : null}
                      </td>
                      <td className="p-3">
                        {row.lots.length || row.openPos.length || row.underTest || row.free ? (
                          <button type="button" onClick={() => setOpenRow(expanded ? null : row.productId)} aria-expanded={expanded} aria-label={t('dermat_orders.file.details', 'Details')} className="rounded p-1 hover:bg-muted">
                            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="bg-muted/20">
                        <td colSpan={9} className="px-6 py-3 text-xs">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 font-semibold">{t('dermat_orders.file.issuedBatches', 'Issued by the store')}</p>
                              {row.lots.length ? (
                                <ul className="space-y-0.5">
                                  {row.lots.map((lot, index) => (
                                    <li key={`${lot.request}-${lot.lotNumber}-${index}`} className="tabular-nums">
                                      <span className="font-mono">{lot.lotNumber}</span> · {formatQty(lot.quantity)} {unit} · {stageDef(lot.stage)?.label ?? lot.stage} · <span className="font-mono">{lot.request}</span>
                                      {lot.at ? ` · ${formatDate(lot.at.slice(0, 10))}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-muted-foreground">{t('dermat_orders.file.nothingIssued', 'Nothing issued yet.')}</p>
                              )}
                            </div>
                            {file.open ? (
                              <div>
                                <p className="mb-1 font-semibold">{t('dermat_orders.file.stockPicture', 'Stock picture now')}</p>
                                <p className="tabular-nums">{t('dermat_orders.file.freeLine', 'Free in store: {free} {unit} · under QC: {test} {unit} · on open POs: {po} {unit}', { free: formatQty(row.free), test: formatQty(row.underTest), po: formatQty(row.onOrder), unit })}</p>
                                {row.openPos.map((po) => (
                                  <p key={po.id}>
                                    <Link href={`/backend/purchase/orders/${po.id}`} className="font-mono hover:underline">{po.code}</Link> · {po.vendorName} · {formatQty(po.open)} {unit} {po.expectedDate ? `· due ${formatDate(po.expectedDate)}` : ''}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-lg border bg-card">
          <header className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3 text-sm font-bold">
            <ShoppingCart className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dermat_orders.file.bought', 'Bought for this order')}
          </header>
          <div className="space-y-3 p-4 text-sm">
            {file.indents.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('dermat_orders.file.indents', 'Indents')}</span>
                {file.indents.map((indent) => <Chip key={indent.id} href="/backend/purchase/indents" code={indent.code} status={indent.status} extra={indent.department} />)}
              </div>
            ) : null}
            {file.purchases.length ? (
              <ul className="space-y-2">
                {file.purchases.map((po) => (
                  <li key={po.id} className="flex flex-wrap items-center gap-2">
                    <Chip href={`/backend/purchase/orders/${po.id}`} code={po.code} status={po.status} extra={`${po.vendorName} · ₹${formatQty(po.total, 2)}`} />
                    {po.grns.length ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
                    {po.grns.map((grn) => <Chip key={grn.id} href={`/backend/purchase/grns/${grn.id}`} code={grn.code} status={grn.status} extra={formatDate(grn.grnDate)} />)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t('dermat_orders.file.nothingBought', 'Nothing was bought specially for this order; it used stock already in the store.')}</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <header className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3 text-sm font-bold">
            <Factory className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dermat_orders.file.made', 'Made and dispatched')}
          </header>
          <div className="divide-y text-sm">
            {file.output.map((line) => (
              <div key={line.lineId} className="space-y-1 p-4">
                <p className="font-medium">{line.title} <span className="font-mono text-xs text-muted-foreground">{line.batchNo ? `· batch ${line.batchNo}` : ''}</span></p>
                <ol className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                  <li className="rounded border px-2 py-0.5">{t('dermat_orders.file.ordered', 'Ordered {n} pcs', { n: formatQty(line.ordered) })}</li>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <li className="rounded border px-2 py-0.5">{line.bulkMadeKg ? t('dermat_orders.file.bulkMade', 'Bulk {kg} kg', { kg: formatQty(line.bulkMadeKg, 1) }) : t('dermat_orders.file.bulkNotYet', 'Bulk not made')}</li>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <li className="rounded border px-2 py-0.5">{line.filled ? t('dermat_orders.file.filled', 'Filled {n}', { n: formatQty(line.filled) }) : t('dermat_orders.file.notFilled', 'Not filled')}{line.rejected ? ` (−${formatQty(line.rejected)})` : ''}</li>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <li className="rounded border px-2 py-0.5">{line.packed ? t('dermat_orders.file.packed', 'Packed {n}', { n: formatQty(line.packed) }) : t('dermat_orders.file.notPacked', 'Not packed')}</li>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <li className={cn('rounded border px-2 py-0.5', line.dispatched && 'border-status-success-border bg-status-success-bg text-status-success-text')}>{line.dispatched ? t('dermat_orders.file.dispatched', 'Dispatched {n} on {date}', { n: formatQty(line.dispatched), date: line.dispatchDate ? formatDate(line.dispatchDate) : '—' }) : t('dermat_orders.file.notDispatched', 'Not dispatched')}</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  {[
                    line.bulkLeftKg ? t('dermat_orders.file.bulkLeft', '{kg} kg bulk left in production', { kg: formatQty(line.bulkLeftKg, 2) }) : null,
                    line.fgInStore ? t('dermat_orders.file.fgLeft', '{n} pcs of this batch in FG store', { n: formatQty(line.fgInStore) }) : null,
                    line.packedLocation ? t('dermat_orders.file.location', 'kept at {place}', { place: line.packedLocation }) : null,
                    line.deliveredOn ? t('dermat_orders.file.delivered', 'delivered {date}', { date: formatDate(line.deliveredOn) }) : null,
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
                {line.bulkId ? <Link href={`/backend/products/${line.bulkId}`} className="text-xs text-muted-foreground hover:underline">{line.bulkTitle}</Link> : null}
              </div>
            ))}
            {file.invoices.length ? (
              <div className="flex flex-wrap items-center gap-2 p-4">
                <span className="text-xs text-muted-foreground">{t('dermat_orders.file.invoices', 'Invoices')}</span>
                {file.invoices.map((invoice) => <Chip key={invoice.id} href={`/backend/accounts/invoices/${invoice.id}`} code={invoice.code} status={invoice.status} extra={`₹${formatQty(invoice.total, 2)}`} />)}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

export function StageConnections({ order, stage }: { order: Order; stage: Stage }) {
  const t = useT()
  const def = stageDef(stage.key)
  const before = (def?.after ?? []).map((key) => order.stages.find((entry) => entry.key === key)).filter((entry): entry is Stage => Boolean(entry) && entry!.key !== 'order')
  const after = stageList().filter((entry) => entry.after.includes(stage.key)).map((entry) => order.stages.find((item) => item.key === entry.key)).filter((entry): entry is Stage => Boolean(entry))
  if (!before.length && !after.length) return null
  const when = (value: string | null) => (value ? formatDate(value.slice(0, 10)) : null)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {before.length ? (
        <>
          <span>{t('dermat_orders.file.cameAfter', 'Came after')}</span>
          {before.map((entry) => (
            <span key={entry.key} className="rounded border bg-card px-1.5 py-0.5 text-foreground">
              {entry.label}
              {entry.completedAt ? <span className="text-muted-foreground"> · {when(entry.completedAt)}</span> : null}
            </span>
          ))}
        </>
      ) : null}
      {after.length ? (
        <>
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
          <span>{stage.status === 'done' ? t('dermat_orders.file.opened', 'opened') : t('dermat_orders.file.opens', 'opens')}</span>
          {after.map((entry) => (
            <span key={entry.key} className="rounded border bg-card px-1.5 py-0.5 text-foreground">
              {entry.label}
              <span className="text-muted-foreground"> · {entry.status === 'done' ? t('dermat_orders.file.doneOn', 'done {date}', { date: when(entry.completedAt) ?? '' }) : entry.status === 'waiting' ? t('dermat_orders.file.waiting', 'waiting') : words(entry.status)}</span>
            </span>
          ))}
        </>
      ) : null}
    </div>
  )
}

export function StageFileDetails({ order, stage, file }: { order: Order; stage: Stage; file: OrderFileData | null }) {
  const t = useT()
  const docs = (order.documents?.[stage.key] ?? []).filter((doc) => doc.count || doc.needed)
  const materials = (file?.materials ?? []).map((row) => ({ row, lots: row.lots.filter((lot) => lot.stage === stage.key) })).filter((entry) => entry.lots.length)
  const checks = (file?.qc ?? []).filter((check) => check.stageKey === stage.key)
  const production = ['manufacturing', 'filling', 'packing', 'dispatch'].includes(stage.key)
  return (
    <div className="space-y-3">
      <StageConnections order={order} stage={stage} />
      {docs.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {docs.map((doc) => (
            <span key={doc.key} className={cn('rounded-md border px-2 py-1', doc.count ? 'border-status-success-border bg-status-success-bg text-status-success-text' : 'border-status-warning-border bg-status-warning-bg text-status-warning-text')}>
              {doc.label} · {doc.count ? t('dermat_orders.docs.files', '{count} file(s)', { count: doc.count }) : t('dermat_orders.file.missingDoc', 'missing')}
            </span>
          ))}
        </div>
      ) : null}
      {materials.length ? (
        <div className="rounded-md border">
          <p className="border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">{t('dermat_orders.file.stageMaterials', 'Materials issued for this stage')}</p>
          <ul className="divide-y text-xs">
            {materials.map(({ row, lots }) => (
              <li key={row.productId} className="flex flex-wrap justify-between gap-2 px-3 py-1.5 tabular-nums">
                <span>{row.title}</span>
                <span className="text-muted-foreground">
                  {lots.map((lot) => `${formatQty(lot.quantity)} ${row.unit ?? ''} · ${lot.lotNumber}`).join(' + ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {checks.length ? (
        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="rounded-md border">
              <Link href={`/backend/qc/checks/${check.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs hover:bg-muted">
                <span className="flex items-center gap-1.5 font-semibold">
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                  {check.code}
                  {check.round > 1 ? ` · round ${check.round}` : ''} · {check.productTitle}
                  {check.batchNo ? ` · batch ${check.batchNo}` : ''}
                </span>
                <StatusBadge variant={DOC_STATUS[check.status] ?? 'neutral'}>{words(check.status)}</StatusBadge>
              </Link>
              {check.results.length ? (
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {check.results.map((result) => (
                      <tr key={`${check.id}-${result.name}`}>
                        <td className="px-3 py-1">{result.name}</td>
                        <td className="px-3 py-1 text-muted-foreground">{result.spec}</td>
                        <td className={cn('px-3 py-1 text-right font-medium', result.inSpec === false && 'text-status-error-text')}>{result.observation || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="px-3 py-1 text-xs text-muted-foreground">
                {[check.chemicalBy ? `Chemical: ${check.chemicalBy}` : null, check.microBy ? `Micro: ${check.microBy}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {stage.key === 'planning' && file ? (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {t('dermat_orders.file.planningLine', '{reserved} reserved · {used} used · {short} short', { reserved: file.summary.reserved, used: file.summary.used + file.summary.withProduction, short: file.summary.short })}
          {file.purchases.map((po) => <Chip key={po.id} href={`/backend/purchase/orders/${po.id}`} code={po.code} status={po.status} />)}
        </p>
      ) : null}
      {production && file ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {file.output.map((line) => {
            const text =
              stage.key === 'manufacturing' ? (line.bulkMadeKg ? `${formatQty(line.bulkMadeKg, 1)} kg bulk · batch ${line.batchNo ?? '—'}${line.bulkLeftKg ? ` · ${formatQty(line.bulkLeftKg, 2)} kg left` : ''}` : null)
                : stage.key === 'filling' ? (line.filled ? `${formatQty(line.filled)} filled${line.rejected ? ` · ${formatQty(line.rejected)} rejected` : ''}` : null)
                  : stage.key === 'packing' ? (line.packed ? `${formatQty(line.packed)} packed into FG store${line.packedLocation ? ` · ${line.packedLocation}` : ''}` : null)
                    : line.dispatched ? `${formatQty(line.dispatched)} dispatched${line.deliveredOn ? ` · delivered ${formatDate(line.deliveredOn)}` : ''}${line.fgInStore ? ` · ${formatQty(line.fgInStore)} still in FG store` : ''}` : null
            return text ? (
              <span key={line.lineId} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
                {stage.key === 'dispatch' ? <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <Factory className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                {file.output.length > 1 ? `${line.title}: ` : ''}
                {text}
              </span>
            ) : null
          })}
        </div>
      ) : null}
      {stage.key === 'billing' && file?.invoices.length ? (
        <div className="flex flex-wrap gap-2">
          {file.invoices.map((invoice) => <Chip key={invoice.id} href={`/backend/accounts/invoices/${invoice.id}`} code={invoice.code} status={invoice.status} extra={`₹${formatQty(invoice.total, 2)}`} />)}
        </div>
      ) : null}
    </div>
  )
}
