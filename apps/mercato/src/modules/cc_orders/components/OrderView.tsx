"use client"

import * as React from 'react'
import { OrderHistory } from './OrderHistory'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Ban, CheckCircle2, Copy, Layers, Lock, Package, Pencil } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { HorizontalScroll } from '@open-mercato/ui/primitives/drag-scroll'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { LINE_SPEC_SECTIONS } from '../lib/specs'
import { stageList, stageDef } from '../lib/stages'
import { ORDER_VARIANT, STAGE_VARIANT, daysUntil, formatDate, formatDateTime, formatQty } from './format'
import { type StageActionRequest } from './StageSheet'
import { StageRecord } from './StageRecord'
import { subStageProgress } from './subStages'
import { useStageAction } from './useStageAction'
import { OrderMoneyCard } from './OrderMoneyCard'
import { AttentionList, DocumentsOverview, orderAttention, type OrderTab } from './OrderPanels'
import type { Order, Stage } from './types'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { WhatsAppMenu } from '../../cc_products/components/WhatsAppMenu'
import { customerMessages } from './customerMessages'
import { openServerExport } from '../../cc_products/lib/csvExport'
import { paymentTermLabel } from '../../cc_lists/lib/paymentTerms'
import { useStageSettings } from './useStageSettings'
import { PRODUCT_KINDS } from '../../cc_products/lib/kinds'


const KIND_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_KINDS.map((kind) => [kind.code, kind.label]))

type RailBlock = { kind: 'single'; key: string } | { kind: 'arms'; lanes: Array<{ label: string; keys: string[] }> }

const RAIL: RailBlock[] = [
  { kind: 'single', key: 'order' },
  { kind: 'single', key: 'advance' },
  { kind: 'single', key: 'allocation' },
  { kind: 'single', key: 'qc' },
  { kind: 'single', key: 'packing' },
  { kind: 'single', key: 'invoice' },
  { kind: 'single', key: 'dispatch' },
]

const STAGE_TONE: Record<string, string> = {
  done: 'border-status-success-border bg-status-success-bg',
  skipped: 'border-border bg-muted/40',
  open: 'border-status-warning-border bg-status-warning-bg',
  on_hold: 'border-status-error-border bg-status-error-bg',
  waiting: 'border-dashed border-border bg-background opacity-50',
}


function StageCard({ order, stage, onOpen }: { order: Order; stage: Stage; onOpen: () => void }) {
  const t = useT()
  useStageSettings()
  const progress = subStageProgress(order, stage)
  return (
    <button
      type="button"
      onClick={onOpen}
      title={stage.status === 'waiting' ? 'Opens when the earlier stages are done' : undefined}
      className={cn(
        'w-full rounded-lg border p-2.5 text-left transition-shadow',
        stage.status === 'waiting' ? 'cursor-default' : 'hover:shadow-sm',
        stage.status === 'open' && !stage.locked && 'ring-2 ring-status-warning-border',
        stage.locked && 'opacity-80',
        STAGE_TONE[stage.status] ?? STAGE_TONE.waiting,
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold leading-tight">{stage.label}</span>
        {stage.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success-icon" /> : null}
        {stage.status === 'waiting' || stage.locked ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={stage.locked ? t('cc_orders.locked.with', 'Details with {department}', { department: stage.department }) : undefined} /> : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{stage.department}</div>
      <div className="mt-1.5 truncate text-xs">
        {stage.status === 'open' ? (
          <span className={cn('mr-1 rounded-sm px-1 font-semibold', stage.data?.__started ? 'bg-status-info-bg text-status-info-text' : 'bg-status-warning-bg text-status-warning-text')}>
            {stage.data?.__started ? t('cc_orders.workState.in_progress', 'In progress') : t('cc_orders.workState.pending', 'Pending')}
          </span>
        ) : null}
        {stage.status === 'waiting'
          ? t('cc_orders.rail.waiting', 'Coming')
          : stage.status === 'skipped'
            ? t('cc_orders.rail.skipped', 'Skipped')
            : stage.responsibleName ?? (stage.status === 'done' ? stage.completedByName : null) ?? t('cc_orders.rail.unassigned', 'Not assigned')}
      </div>
      {progress.total && stage.status !== 'waiting' && stage.status !== 'skipped' ? (
        <div className="mt-1.5 space-y-1">
          <div className="flex h-1 overflow-hidden rounded-full bg-input" aria-hidden="true">
            <span className={cn('h-full rounded-full', stage.status === 'done' ? 'bg-status-success-icon' : 'bg-status-warning-icon')} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <div className="truncate text-xs">
            <span className="tabular-nums">
              {progress.done}/{progress.total}
            </span>
            {progress.current ? <span className="text-muted-foreground"> · {progress.current}</span> : null}
          </div>
        </div>
      ) : null}
      {stage.days != null && stage.status !== 'waiting' ? (
        <div className={cn('text-xs', stage.status === 'on_hold' ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>
          {stage.status === 'on_hold' ? `${stage.holdParty ?? t('cc_orders.rail.hold', 'On hold')} · ` : ''}
          {t('cc_orders.rail.days', '{days} d', { days: formatQty(stage.days, 1) })}
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
  useStageSettings()
  const granted = useGranted()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-order-view-${orderId}` })
  const stageRunner = useStageAction(`cc-order-stage-${orderId}`)
  const [order, setOrder] = React.useState<Order | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const searchParams = useSearchParams()
  const [openStage, setOpenStage] = React.useState<string | null>(() => searchParams?.get('stage') ?? null)
  const [cancelBusy, setBusy] = React.useState(false)
  const busy = cancelBusy || stageRunner.busy
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [tab, setTab] = React.useState<OrderTab>('work')

  const load = React.useCallback(async () => {
    const call = await apiCall<Order>(`/api/cc_orders/orders?id=${encodeURIComponent(orderId)}`)
    if (!call.ok || !call.result) {
      setLoadError(
        call.status === 404
          ? t('cc_orders.errors.notFound', 'This order does not exist any more. It may have been deleted, or the link is wrong.')
          : t('cc_orders.errors.load', 'Could not load the order.'),
      )
      return
    }
    setOrder(call.result)
  }, [orderId, t])

  React.useEffect(() => {
    const asked = searchParams?.get('stage')
    if (!order || !asked || !order.access || order.access.full) return
    router.replace(`/backend/orders/${order.id}/stages/${asked}`)
  }, [order, searchParams, router])

  React.useEffect(() => {
    if (!order || openStage || !order.access || order.access.full) return
    const mine = order.stages.filter((stage) => !stage.locked)
    const focus = mine.find((stage) => stage.status === 'open' || stage.status === 'on_hold') ?? mine.find((stage) => stage.status !== 'waiting')
    if (focus) setOpenStage(focus.key)
  }, [order, openStage])

  React.useEffect(() => {
    load()
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/cc_orders/people', undefined, { fallback: { items: [] } }).then((call) =>
      setPeople(call.result?.items ?? []),
    )
  }, [load])

  const stageAction = async (stage: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!order) return false
    const result = await stageRunner.run(order, stage, request)
    if (result.order) {
      setOrder(result.order)
      if (request.action === 'complete' || request.action === 'skip') {
        const nextOpen = result.order.stages.filter(
          (entry) => (entry.status === 'open' || entry.status === 'on_hold') && order.stages.find((before) => before.key === entry.key)?.status === 'waiting',
        )
        setOpenStage(nextOpen[0]?.key ?? null)
      }
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
            apiCall<Order & { error?: string }>('/api/cc_orders/orders/cancel', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
          ),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_orders.errors.cancel', 'Could not cancel the order.'), 'error')
        return
      }
      setOrder(call.result)
      setCancelOpen(false)
      setCancelReason('')
      flash(t('cc_orders.flash.cancelled', 'Order cancelled'), 'success')
    } catch {
      flash(t('cc_orders.errors.cancel', 'Could not cancel the order.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
            <ErrorMessage label={loadError} />
            <Button asChild variant="outline">
              <Link href="/backend/orders">{t('cc_orders.view.backToBook', 'Back to the Order Book')}</Link>
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }
  if (!order) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_orders.loading', 'Loading order…')} />
        </PageBody>
      </Page>
    )
  }

  const stagesByKey = new Map(order.stages.map((stage) => [stage.key, stage]))
  const current = order.stages.filter((stage) => stage.status === 'open' || stage.status === 'on_hold')
  const done = order.stages.filter((stage) => stage.status === 'done' || stage.status === 'skipped').length
  const deliveryIn = daysUntil(order.deliveryDate)
  const totalPieces = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const statusLabel = t(`cc_orders.status.${order.status}`, order.status)
  const limited = Boolean(order.access && !order.access.full)
  const attention = orderAttention(order, t).filter((item) => !limited || (item.action?.stageKey ? !stagesByKey.get(item.action.stageKey)?.locked : false))
  const goToStage = (key: string) => {
    setTab('work')
    setOpenStage(key)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {t('cc_orders.back', 'Order book')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-bold">{order.orderNo}</h1>
                <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'} dot>
                  {statusLabel}
                </StatusBadge>
                {order.onHold ? <StatusBadge variant="error">{t('cc_orders.status.on_hold', 'On hold')}</StatusBadge> : null}
                {order.priority === 'urgent' ? <StatusBadge variant="error">{t('cc_orders.priority.urgent', 'Urgent')}</StatusBadge> : null}
                {order.headline === 'delivered' ? <StatusBadge variant="success">{t('cc_orders.headline.delivered', 'Delivered')}</StatusBadge> : null}
                {order.headline === 'updated' ? (
                  <span title={[order.revisedByName, order.revisedAt ? formatDateTime(order.revisedAt) : null, order.revisionNote].filter(Boolean).join(' · ')}>
                    <StatusBadge variant="info">{t('cc_orders.headline.updated', 'Updated')}</StatusBadge>
                  </span>
                ) : null}
                {order.orderType !== 'new' ? <StatusBadge variant="info">{t(`cc_orders.type.${order.orderType}`, order.orderType)}</StatusBadge> : null}
              </div>
              <p className="text-sm">
                {limited ? (
                  <span className="font-semibold">{order.customer?.name || t('cc_orders.view.customer', 'Customer')}</span>
                ) : (
                  <Link href={`/backend/customers/companies/${order.customerId}`} className="font-semibold text-primary hover:underline">
                    {order.customer?.name || t('cc_orders.view.customer', 'Customer')}
                  </Link>
                )}
                <span className="text-muted-foreground">
                  {' · '}
                  {t('cc_orders.view.progress', '{done} of {total} stages done', { done, total: order.stages.length })}
                  {current.length ? ` · ${t('cc_orders.view.now', 'Now: {stages}', { stages: current.map((stage) => stage.label).join(' + ') })}` : ''}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {limited ? null : <WhatsAppMenu phone={order.customer?.phone} recipient={order.customer?.name ?? t('cc_orders.view.customer', 'Customer')} messages={customerMessages(order)} />}
              <ExportButton
                size="sm"
                label={t('cc_orders.view.export', 'Export order file')}
                onExport={() => openServerExport(`/api/cc_orders/orders/export?orderId=${encodeURIComponent(order.id)}`)}
              />
              {granted.has('cc_orders.manage') ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/orders/new?copyFrom=${order.id}`}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  {t('cc_orders.view.repeat', 'Repeat order')}
                </Link>
              </Button>
              ) : null}
              {order.status !== 'cancelled' && order.status !== 'completed' && granted.has('cc_orders.manage') ? (
                <>
                  <Button type="button" variant="destructive-ghost" size="sm" onClick={() => setCancelOpen(true)}>
                    <Ban className="mr-1.5 h-4 w-4" />
                    {t('cc_orders.view.cancel', 'Cancel order')}
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/backend/orders/${order.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      {t('cc_orders.view.edit', 'Edit order')}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('cc_orders.view.stages', 'Stages')}</CardTitle>
              <CardDescription className="text-xs">
                {t('cc_orders.view.stagesHint', 'Green = done · Orange = in progress · Red = on hold · Grey = coming. Click a stage to open its work.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <HorizontalScroll showButtons showGradients step={340}>
                <div className="flex min-w-max items-stretch gap-2 py-1 px-1">
                  {RAIL.map((block, index) => (
                    <React.Fragment key={block.kind === 'single' ? block.key : 'arms'}>
                      {index > 0 ? <div className="flex items-center text-muted-foreground">›</div> : null}
                      {block.kind === 'single' ? (
                        <div className="flex w-36 flex-col justify-center">
                          {stagesByKey.get(block.key) ? (
                            <StageCard order={order} stage={stagesByKey.get(block.key)!} onOpen={() => goToStage(block.key)} />
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
                          {block.lanes.map((lane) => (
                            <div key={lane.label} className="flex items-center gap-2">
                              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t(`cc_orders.rail.lane.${lane.keys[0]}`, lane.label)}
                              </span>
                              {lane.keys.map((key, laneIndex) => (
                                <React.Fragment key={key}>
                                  {laneIndex > 0 ? <span className="text-muted-foreground">›</span> : null}
                                  <div className="w-36">
                                    {stagesByKey.get(key) ? <StageCard order={order} stage={stagesByKey.get(key)!} onOpen={() => goToStage(key)} /> : null}
                                  </div>
                                </React.Fragment>
                              ))}
                            </div>
                          ))}
                          <span className="text-center text-xs text-muted-foreground">
                            {t('cc_orders.rail.merge', 'Both arms must finish before Manufacturing')}
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </HorizontalScroll>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="min-w-0 space-y-4 lg:col-span-8">
              <SegmentedControl value={tab} onValueChange={(value) => setTab(value as OrderTab)} aria-label={t('cc_orders.view.sections', 'Order sections')}>
                <SegmentedControlItem value="work">{t('cc_orders.view.tabWork', 'Stage work')}</SegmentedControlItem>
                <SegmentedControlItem value="products">{t('cc_orders.view.tabProducts', 'Items & specs')}</SegmentedControlItem>
                <SegmentedControlItem value="documents">{t('cc_orders.view.tabDocuments', 'Documents')}</SegmentedControlItem>
                {order.canSeeMoney ? <SegmentedControlItem value="money">{t('cc_orders.view.tabMoney', 'Money')}</SegmentedControlItem> : null}
                <SegmentedControlItem value="history">{t('cc_orders.view.tabHistory', 'History')}</SegmentedControlItem>
              </SegmentedControl>
              {tab === 'work' ? <StageRecord order={order} people={people} busy={busy} focusKey={openStage} onAction={stageAction} /> : null}
              {tab === 'products' ? (
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Package className="h-4 w-4 text-primary" />
                {t('cc_orders.view.products', 'Items ({count})', { count: order.lines.length })}
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
                        {[line.specs.material?.grade, line.specs.material?.weave, line.specs.material?.sheet_size, line.specs.material?.thickness_mm ? `${line.specs.material.thickness_mm} mm` : null, line.specs.material?.die_no ? `Die ${line.specs.material.die_no}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-semibold">{t('cc_orders.view.kg', '{count} kg', { count: formatQty(line.quantity, 3) })}{line.specs.material?.pieces ? ` · ${line.specs.material.pieces} pcs` : ''}</span>
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
                  <Info label={t('cc_orders.form.productRemarks', 'Product remarks')}>{order.productRemarks ?? '—'}</Info>
                  <Info label={t('cc_orders.form.packingRemarks', 'Packing remarks')}>{order.packingRemarks ?? '—'}</Info>
                  <Info label={t('cc_orders.form.billingRemarks', 'Billing remarks')}>{order.billingRemarks ?? '—'}</Info>
                </div>
              ) : null}
            </CardContent>
          </Card>
              ) : null}
              {tab === 'documents' ? <DocumentsOverview order={limited ? { ...order, stages: order.stages.filter((stage) => !stage.locked) } : order} onStage={goToStage} /> : null}
              {tab === 'money' && order.canSeeMoney ? <OrderMoneyCard order={order} onChanged={load} /> : null}
              {tab === 'history' ? <OrderHistory events={order.events} /> : null}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:col-span-4 lg:self-start">
              <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="order-attention">
                <h2 id="order-attention" className="text-sm font-semibold">
                  {t('cc_orders.view.attention', 'Needs attention')}
                </h2>
                <AttentionList items={attention} onStage={goToStage} onTab={setTab} />
              </section>
{order.totals && order.payments ? (() => {
                const sums = order.totals
                const paid = order.payments
                return (
              <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="order-money">
                <div className="flex items-center justify-between">
                  <h2 id="order-money" className="text-sm font-semibold">
                    {t('cc_orders.view.moneyTitle', 'Money')}
                  </h2>
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setTab('money')}>
                    {t('cc_orders.view.moneyOpen', 'Payments & documents')}
                  </button>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('cc_orders.view.orderValue', 'Order value')}</dt>
                    <dd className="font-semibold tabular-nums">{formatQty(sums.total, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('cc_orders.view.received', 'Received')}</dt>
                    <dd className="font-semibold tabular-nums text-status-success-text">{formatQty(paid.received, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('cc_orders.view.due', 'Due')}</dt>
                    <dd className={cn('font-semibold tabular-nums', paid.due > 0.5 && 'text-status-warning-text')}>{formatQty(Math.max(0, paid.due), 0)}</dd>
                  </div>
                </dl>
                {sums.total > 0 ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full bg-status-success-solid" style={{ width: `${Math.min(100, Math.round((paid.received / sums.total) * 100))}%` }} />
                  </div>
                ) : null}
              </section>
                )
              })() : null}
              <section className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-4" aria-label={t('cc_orders.view.summary', 'Order summary')}>
            <Info label={t('cc_orders.view.orderDate', 'Order date')}>{formatDate(order.orderDate)}</Info>
            <Info label={t('cc_orders.view.delivery', 'Delivery')}>
              <span className={cn(deliveryIn !== null && deliveryIn < 0 && order.status !== 'completed' && 'text-status-error-text')}>
                {formatDate(order.deliveryDate)}
                {deliveryIn !== null && order.status !== 'completed' && order.status !== 'cancelled'
                  ? ` · ${deliveryIn < 0 ? t('cc_orders.view.late', '{days} d late', { days: -deliveryIn }) : t('cc_orders.view.left', '{days} d left', { days: deliveryIn })}`
                  : ''}
              </span>
            </Info>
            <Info label={t('cc_orders.view.pieces', 'Total pieces')}>{formatQty(totalPieces, 0)}</Info>
            <Info label={t('cc_orders.view.salesManager', 'Sales manager')}>{order.salesManager ?? '—'}</Info>
            {order.paymentTerms || order.paymentRemarks ? (
              <Info label={t('cc_orders.view.payment', 'Payment')}>
                {[paymentTermLabel(order.paymentTerms), order.paymentRemarks].filter(Boolean).join(' · ')}
              </Info>
            ) : null}
            <Info label={t('cc_orders.view.po', 'Customer PO')}>{order.customerPoRef ?? '—'}</Info>
              </section>
            </aside>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('cc_orders.view.createdBy', 'Booked by {name} on {date}', { name: order.createdByName ?? '—', date: formatDateTime(order.createdAt) })} ·{' '}
            {stageList().length} {t('cc_orders.view.stagesWord', 'stages')}
          </p>
        </div>

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
              <DialogTitle>{t('cc_orders.cancel.title', 'Cancel order {no}?', { no: order.orderNo })}</DialogTitle>
              <DialogDescription>{t('cc_orders.cancel.hint', 'The order stays in the order book as cancelled. Write why.')}</DialogDescription>
            </DialogHeader>
            <Textarea autoFocus rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
                {t('cc_orders.cancel.keep', 'Keep order')}
              </Button>
              <Button type="button" variant="destructive" onClick={cancelOrder} disabled={busy || !cancelReason.trim()}>
                {t('cc_orders.cancel.confirm', 'Cancel order')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default OrderView
