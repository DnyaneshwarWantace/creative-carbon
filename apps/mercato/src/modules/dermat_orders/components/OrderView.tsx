"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Ban, Copy, FileStack, History, Layers, Package, Pencil, UserRound } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { LINE_SPEC_SECTIONS } from '../lib/specs'
import { STAGES, stageDef } from '../lib/stages'
import { ORDER_VARIANT, PAYMENT_TERMS_LABEL, STAGE_VARIANT, daysUntil, formatDate, formatDateTime, formatQty } from './format'
import { StageSheet, type StageActionRequest } from './StageSheet'
import { useStageAction } from './useStageAction'
import type { Order, Stage } from './types'

type Requirement = { productId: string; name: string; code: string | null; kind: string | null; unit: string | null; quantity: number; onHand: number }
type TreeNode = { productId: string; kind: string | null; quantity: number; unit: string | null; children: TreeNode[] }

const KIND_LABEL: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG' }

const STAGE_COLUMNS: string[][] = [
  ['order'],
  ['advance'],
  ['sampling'],
  ['artwork', 'formulation'],
  ['planning'],
  ['manufacturing'],
  ['filling'],
  ['packing'],
  ['qc_qa'],
  ['billing'],
  ['dispatch'],
]

const STAGE_TONE: Record<string, string> = {
  done: 'border-status-success-border bg-status-success-bg',
  skipped: 'border-border bg-muted/40',
  open: 'border-status-warning-border bg-status-warning-bg',
  on_hold: 'border-status-error-border bg-status-error-bg',
  waiting: 'border-dashed border-border bg-background',
}

const ACTION_LABEL: Record<string, string> = {
  created: 'Order booked',
  opened: 'Started',
  saved: 'Saved',
  completed: 'Done',
  held: 'Put on hold',
  resumed: 'Resumed',
  reverted: 'Reopened',
  skipped: 'Skipped',
  assigned: 'Assigned to',
  edited: 'Order edited',
  step_done: 'Ticked',
  step_undone: 'Unticked',
  cancelled: 'Order cancelled',
}

function StageCard({ stage, onOpen }: { stage: Stage; onOpen: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('w-full rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm', STAGE_TONE[stage.status] ?? STAGE_TONE.waiting)}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold leading-tight">{stage.label}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{stage.department}</div>
      <div className="mt-1.5 truncate text-xs">
        {stage.status === 'waiting'
          ? t('dermat_orders.rail.waiting', 'Coming')
          : stage.status === 'skipped'
            ? t('dermat_orders.rail.skipped', 'Skipped')
            : stage.responsibleName ?? (stage.status === 'done' ? stage.completedByName : null) ?? t('dermat_orders.rail.unassigned', 'Not assigned')}
      </div>
      {stage.days != null && stage.status !== 'waiting' ? (
        <div className={cn('text-xs', stage.status === 'on_hold' ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>
          {stage.status === 'on_hold' ? `${stage.holdParty ?? t('dermat_orders.rail.hold', 'On hold')} · ` : ''}
          {t('dermat_orders.rail.days', '{days} d', { days: formatQty(stage.days, 1) })}
        </div>
      ) : null}
    </button>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{children}</div>
    </div>
  )
}

export function OrderView({ orderId }: { orderId: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-order-view-${orderId}` })
  const stageRunner = useStageAction(`dermat-order-stage-${orderId}`)
  const [order, setOrder] = React.useState<Order | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const [openStage, setOpenStage] = React.useState<string | null>(null)
  const [cancelBusy, setBusy] = React.useState(false)
  const busy = cancelBusy || stageRunner.busy
  const [materials, setMaterials] = React.useState<{ rows: Requirement[]; bulkByLine: Record<string, number>; missing: string[] } | null>(null)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<Order>(`/api/dermat_orders/orders?id=${encodeURIComponent(orderId)}`)
    if (!call.ok || !call.result) {
      setLoadError(t('dermat_orders.errors.load', 'Could not load the order.'))
      return
    }
    setOrder(call.result)
  }, [orderId, t])

  React.useEffect(() => {
    load()
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/dermat_orders/people', undefined, { fallback: { items: [] } }).then((call) =>
      setPeople(call.result?.items ?? []),
    )
  }, [load])

  const lineKey = order?.lines.map((line) => `${line.productId}:${line.quantity}:${line.bom?.id ?? ''}`).join('|') ?? ''

  React.useEffect(() => {
    if (!order) return
    let cancelled = false
    ;(async () => {
      const totals = new Map<string, Requirement>()
      const bulkByLine: Record<string, number> = {}
      const missing: string[] = []
      for (const line of order.lines) {
        if (!line.bom) {
          missing.push(line.product?.title ?? '—')
          continue
        }
        const call = await apiCall<{ tree?: TreeNode; requirements?: Requirement[] }>(
          `/api/dermat_boms/tree?bomId=${encodeURIComponent(line.bom.id)}&quantity=${line.quantity}`,
          undefined,
          { fallback: {} },
        )
        const bulk = (call.result?.tree?.children ?? []).filter((child) => child.kind === 'bulk').reduce((sum, child) => sum + child.quantity, 0)
        bulkByLine[line.id] = bulk
        for (const row of call.result?.requirements ?? []) {
          const current = totals.get(row.productId)
          totals.set(row.productId, current ? { ...current, quantity: current.quantity + row.quantity } : { ...row })
        }
      }
      if (cancelled) return
      const rows = Array.from(totals.values()).sort((a, b) => (a.kind ?? '').localeCompare(b.kind ?? '') || a.name.localeCompare(b.name))
      setMaterials({ rows, bulkByLine, missing })
    })()
    return () => {
      cancelled = true
    }
  }, [order, lineKey])

  const stageAction = async (stage: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!order) return false
    const result = await stageRunner.run(order, stage, request)
    if (result.order) {
      setOrder(result.order)
      if (request.action === 'complete' || request.action === 'skip') setOpenStage(null)
      return true
    }
    if (result.conflict) await load()
    return false
  }

  const cancelOrder = async () => {
    if (!order || !cancelReason.trim()) return
    setBusy(true)
    try {
      const body = { id: order.id, reason: cancelReason.trim() }
      const call = await runMutation({
        context: { orderId: order.id, action: 'cancel' },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(order.updatedAt), () =>
            apiCall<Order & { error?: string }>('/api/dermat_orders/orders/cancel', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
          ),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('dermat_orders.errors.cancel', 'Could not cancel the order.'), 'error')
        return
      }
      setOrder(call.result)
      setCancelOpen(false)
      setCancelReason('')
      flash(t('dermat_orders.flash.cancelled', 'Order cancelled'), 'success')
    } catch {
      flash(t('dermat_orders.errors.cancel', 'Could not cancel the order.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!order) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_orders.loading', 'Loading order…')} />
        </PageBody>
      </Page>
    )
  }

  const stagesByKey = new Map(order.stages.map((stage) => [stage.key, stage]))
  const current = order.stages.filter((stage) => stage.status === 'open' || stage.status === 'on_hold')
  const done = order.stages.filter((stage) => stage.status === 'done' || stage.status === 'skipped').length
  const deliveryIn = daysUntil(order.deliveryDate)
  const totalPieces = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const shortRows = materials?.rows.filter((row) => row.quantity > row.onHand) ?? []
  const selectedStage = openStage ? (stagesByKey.get(openStage) ?? null) : null
  const statusLabel = t(`dermat_orders.status.${order.status}`, order.status)

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {t('dermat_orders.back', 'Order book')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-bold">{order.orderNo}</h1>
                <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'} dot>
                  {statusLabel}
                </StatusBadge>
                {order.onHold ? <StatusBadge variant="error">{t('dermat_orders.status.on_hold', 'On hold')}</StatusBadge> : null}
                {order.orderType !== 'new' ? <StatusBadge variant="info">{t(`dermat_orders.type.${order.orderType}`, order.orderType)}</StatusBadge> : null}
              </div>
              <p className="text-sm">
                <Link href={`/backend/customers/companies/${order.customerId}`} className="font-semibold text-primary hover:underline">
                  {order.customer?.name || t('dermat_orders.view.customer', 'Customer')}
                </Link>
                <span className="text-muted-foreground">
                  {' · '}
                  {t('dermat_orders.view.progress', '{done} of {total} stages done', { done, total: order.stages.length })}
                  {current.length ? ` · ${t('dermat_orders.view.now', 'Now: {stages}', { stages: current.map((stage) => stage.label).join(' + ') })}` : ''}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/orders/new?copyFrom=${order.id}`}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  {t('dermat_orders.view.repeat', 'Repeat order')}
                </Link>
              </Button>
              {order.status !== 'cancelled' && order.status !== 'completed' ? (
                <>
                  <Button type="button" variant="destructive-ghost" size="sm" onClick={() => setCancelOpen(true)}>
                    <Ban className="mr-1.5 h-4 w-4" />
                    {t('dermat_orders.view.cancel', 'Cancel order')}
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/backend/orders/${order.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      {t('dermat_orders.view.edit', 'Edit order')}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Info label={t('dermat_orders.view.orderDate', 'Order date')}>{formatDate(order.orderDate)}</Info>
            <Info label={t('dermat_orders.view.delivery', 'Delivery')}>
              <span className={cn(deliveryIn !== null && deliveryIn < 0 && order.status !== 'completed' && 'text-status-error-text')}>
                {formatDate(order.deliveryDate)}
                {deliveryIn !== null && order.status !== 'completed' && order.status !== 'cancelled'
                  ? ` · ${deliveryIn < 0 ? t('dermat_orders.view.late', '{days} d late', { days: -deliveryIn }) : t('dermat_orders.view.left', '{days} d left', { days: deliveryIn })}`
                  : ''}
              </span>
            </Info>
            <Info label={t('dermat_orders.view.pieces', 'Total pieces')}>{formatQty(totalPieces, 0)}</Info>
            <Info label={t('dermat_orders.view.salesManager', 'Sales manager')}>{order.salesManager ?? '—'}</Info>
            <Info label={t('dermat_orders.view.payment', 'Payment')}>
              {[PAYMENT_TERMS_LABEL[order.paymentTerms ?? ''] ?? order.paymentTerms, order.paymentRemarks].filter(Boolean).join(' · ') || '—'}
            </Info>
            <Info label={t('dermat_orders.view.po', 'Customer PO')}>{order.customerPoRef ?? '—'}</Info>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('dermat_orders.view.stages', 'Stages')}</CardTitle>
              <CardDescription className="text-xs">
                {t('dermat_orders.view.stagesHint', 'Green = done · Orange = in progress · Red = on hold · Grey = coming. Click a stage to work on it.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-4">
              <div className="flex min-w-max items-stretch gap-2">
                {STAGE_COLUMNS.map((column, index) => (
                  <React.Fragment key={column.join('-')}>
                    {index > 0 ? <div className="flex items-center text-muted-foreground">›</div> : null}
                    <div className={cn('flex w-36 flex-col gap-2', column.length > 1 && 'justify-center')}>
                      {column.map((key) => {
                        const stage = stagesByKey.get(key)
                        return stage ? <StageCard key={key} stage={stage} onOpen={() => setOpenStage(key)} /> : null
                      })}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Package className="h-4 w-4 text-primary" />
                {t('dermat_orders.view.products', 'Products ({count})', { count: order.lines.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {order.lines.map((line) => (
                <details key={line.id} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-muted/30">
                    <span className="min-w-0 flex-1">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{line.product?.code ?? ''}</span>
                      {line.product ? (
                        <Link href={`/backend/products/${line.productId}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                          {line.product.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {[line.brandName, line.packSize, line.mrp != null ? `MRP ₹${formatQty(line.mrp, 2)}` : null, line.batchNo ? `Batch ${line.batchNo}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-semibold">{t('dermat_orders.view.pcs', '{count} pcs', { count: formatQty(line.quantity, 0) })}</span>
                    <span className="text-xs text-muted-foreground">
                      {materials?.bulkByLine[line.id] ? t('dermat_orders.view.bulk', '≈ {kg} kg bulk', { kg: formatQty(materials.bulkByLine[line.id], 2) }) : ''}
                    </span>
                    {line.bom ? (
                      <Link href={`/backend/boms/${line.bom.id}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                        <StatusBadge variant={line.bom.status === 'approved' ? 'success' : 'warning'}>
                          <FileStack className="mr-1 h-3 w-3" />
                          {t('dermat_orders.view.bomVersion', 'BOM v{version}', { version: line.bom.version })}
                        </StatusBadge>
                      </Link>
                    ) : (
                      <Link href={`/backend/boms/new?productId=${line.productId}`} onClick={(event) => event.stopPropagation()} className="text-xs text-status-warning-text hover:underline">
                        {t('dermat_orders.view.noBom', 'No BOM — make one')}
                      </Link>
                    )}
                  </summary>
                  <div className="grid grid-cols-1 gap-4 bg-muted/10 px-4 pb-4 pt-2 lg:grid-cols-3">
                    {LINE_SPEC_SECTIONS.map((section) => (
                      <div key={section.key}>
                        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h4>
                        <dl className="space-y-1 text-xs">
                          {section.fields.map((field) => (
                            <div key={field.key} className="grid grid-cols-2 gap-2">
                              <dt className="text-muted-foreground">{field.label}</dt>
                              <dd>{line.specs[section.key]?.[field.key] || '—'}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {order.productRemarks || order.packingRemarks || order.billingRemarks ? (
                <div className="grid grid-cols-1 gap-3 px-4 py-3 text-xs md:grid-cols-3">
                  <Info label={t('dermat_orders.form.productRemarks', 'Product remarks')}>{order.productRemarks ?? '—'}</Info>
                  <Info label={t('dermat_orders.form.packingRemarks', 'Packing remarks')}>{order.packingRemarks ?? '—'}</Info>
                  <Info label={t('dermat_orders.form.billingRemarks', 'Billing remarks')}>{order.billingRemarks ?? '—'}</Info>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <Layers className="h-4 w-4 text-primary" />
                  {t('dermat_orders.view.materials', 'Materials for this order')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {materials
                    ? shortRows.length
                      ? t('dermat_orders.view.materialsShort', '{short} of {total} materials are short. Pieces → bulk kg → raw materials from each BOM.', { short: shortRows.length, total: materials.rows.length })
                      : t('dermat_orders.view.materialsOk', 'Everything is in stock. Pieces → bulk kg → raw materials from each BOM.')
                    : t('dermat_orders.view.materialsLoading', 'Working out materials…')}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {materials?.missing.length ? (
                  <p className="border-b px-4 py-2 text-xs text-status-warning-text">
                    {t('dermat_orders.view.noBomFor', 'No BOM yet for: {products}', { products: materials.missing.join(', ') })}
                  </p>
                ) : null}
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-24 p-3 text-left">{t('dermat_orders.view.code', 'Code')}</th>
                      <th className="p-3 text-left">{t('dermat_orders.view.material', 'Material')}</th>
                      <th className="w-14 p-3 text-center">{t('dermat_orders.view.type', 'Type')}</th>
                      <th className="w-32 p-3 text-right">{t('dermat_orders.view.need', 'Needed')}</th>
                      <th className="w-32 p-3 text-right">{t('dermat_orders.view.onHand', 'On hand')}</th>
                      <th className="w-32 p-3 text-right">{t('dermat_orders.view.short', 'Short')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(materials?.rows ?? []).map((row) => {
                      const short = Math.max(0, row.quantity - row.onHand)
                      return (
                        <tr key={row.productId} className={cn(short > 0 && 'bg-status-error-bg')}>
                          <td className="p-3 font-mono text-xs">{row.code ?? '—'}</td>
                          <td className="p-3">
                            <Link href={`/backend/products/${row.productId}`} className="hover:underline">
                              {row.name}
                            </Link>
                          </td>
                          <td className="p-3 text-center text-xs">{KIND_LABEL[row.kind ?? ''] ?? row.kind}</td>
                          <td className="p-3 text-right font-mono">
                            {formatQty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                          </td>
                          <td className="p-3 text-right font-mono">
                            {formatQty(row.onHand)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                          </td>
                          <td className={cn('p-3 text-right font-mono font-semibold', short > 0 ? 'text-status-error-text' : 'text-muted-foreground')}>
                            {short > 0 ? `${formatQty(short)} ${row.unit ?? ''}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {materials && !materials.rows.length ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                          {t('dermat_orders.view.noMaterials', 'Materials appear once the products have a BOM.')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <History className="h-4 w-4 text-primary" />
                  {t('dermat_orders.view.history', 'History')}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-auto p-0">
                <ol className="divide-y text-sm">
                  {order.events.map((event) => (
                    <li key={event.id} className="px-4 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {t(`dermat_orders.event.${event.action}`, ACTION_LABEL[event.action] ?? event.action)}
                          {event.stageKey && event.action !== 'created' ? ` · ${stageDef(event.stageKey)?.label ?? event.stageKey}` : ''}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.at)}</span>
                      </div>
                      {event.note ? <p className="text-xs">{event.note}</p> : null}
                      {event.byName ? (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserRound className="h-3 w-3" />
                          {event.byName}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('dermat_orders.view.createdBy', 'Booked by {name} on {date}', { name: order.createdByName ?? '—', date: formatDateTime(order.createdAt) })} ·{' '}
            {STAGES.length} {t('dermat_orders.view.stagesWord', 'stages')}
          </p>
        </div>

        <StageSheet
          order={order}
          stage={selectedStage}
          people={people}
          canWork
          busy={busy}
          shortCount={materials ? shortRows.length : null}
          onClose={() => setOpenStage(null)}
          onAction={stageAction}
        />

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                cancelOrder()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('dermat_orders.cancel.title', 'Cancel order {no}?', { no: order.orderNo })}</DialogTitle>
              <DialogDescription>{t('dermat_orders.cancel.hint', 'The order stays in the order book as cancelled. Write why.')}</DialogDescription>
            </DialogHeader>
            <Textarea autoFocus rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
                {t('dermat_orders.cancel.keep', 'Keep order')}
              </Button>
              <Button type="button" variant="destructive" onClick={cancelOrder} disabled={busy || !cancelReason.trim()}>
                {t('dermat_orders.cancel.confirm', 'Cancel order')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default OrderView
