"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, History, Info, Layers, ListChecks, Package } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { LINE_SPEC_SECTIONS } from '../lib/specs'
import { STAGES, stageDef, stepStates, type StageDef } from '../lib/stages'
import { ORDER_VARIANT, PAYMENT_TERMS_LABEL, STAGE_VARIANT, formatDate, formatDateTime, formatQty } from './format'
import { StageWorkArea, type StageActionRequest } from './StageSheet'
import { useOrderMaterials, type OrderMaterials } from './useOrderMaterials'
import { useStageAction } from './useStageAction'
import type { Order, Stage } from './types'

const KIND_LABEL: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG' }

const EVENT_LABEL: Record<string, string> = {
  opened: 'Started',
  saved: 'Saved',
  completed: 'Done',
  held: 'Put on hold',
  resumed: 'Resumed',
  reverted: 'Reopened',
  skipped: 'Skipped',
  assigned: 'Assigned to',
  step_done: 'Ticked',
  step_undone: 'Unticked',
  created: 'Order booked',
}

function stageValue(stage: Stage | undefined, key: string): string | null {
  const value = stage?.data?.[key]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

function orderValue(order: Order): number | null {
  const priced = order.lines.filter((line) => line.rate != null)
  if (!priced.length) return null
  return priced.reduce((sum, line) => sum + line.quantity * (line.rate ?? 0), 0)
}

function money(value: number | null): string {
  return value == null ? '—' : `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-1.5 text-sm">
      <dt className="col-span-2 text-muted-foreground">{label}</dt>
      <dd className="col-span-3 min-w-0 break-words">{children}</dd>
    </div>
  )
}

function MaterialsTable({ materials }: { materials: OrderMaterials | null }) {
  const t = useT()
  if (!materials) return <p className="text-sm text-muted-foreground">{t('dermat_orders.view.materialsLoading', 'Working out materials…')}</p>
  if (!materials.rows.length) return <p className="text-sm text-muted-foreground">{t('dermat_orders.view.noMaterials', 'Materials appear once the products have a BOM.')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-2 text-left">{t('dermat_orders.view.material', 'Material')}</th>
            <th className="pb-2 text-right">{t('dermat_orders.view.need', 'Needed')}</th>
            <th className="pb-2 text-right">{t('dermat_orders.view.onHand', 'On hand')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {materials.rows.map((row) => {
            const short = row.quantity > row.onHand
            return (
              <tr key={row.productId}>
                <td className="py-1.5 pr-2">
                  <span className="mr-1.5 rounded border px-1 text-xs">{KIND_LABEL[row.kind ?? ''] ?? row.kind}</span>
                  <Link href={`/backend/products/${row.productId}`} className="hover:underline">
                    {row.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{row.code}</span> : null}
                    {row.name}
                  </Link>
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatQty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                </td>
                <td className={cn('py-1.5 text-right font-mono', short && 'font-semibold text-status-error-text')}>
                  {formatQty(row.onHand)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SpecsBlock({ order, sections }: { order: Order; sections: Array<'production' | 'primary' | 'secondary'> }) {
  return (
    <div className="space-y-4">
      {order.lines.map((line) => (
        <div key={line.id} className="space-y-2">
          <p className="text-sm font-medium">
            {line.product?.title ?? '—'} <span className="text-muted-foreground">· {formatQty(line.quantity, 0)} pcs</span>
          </p>
          {LINE_SPEC_SECTIONS.filter((section) => sections.includes(section.key)).map((section) => (
            <div key={section.key}>
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h4>
              <dl>
                {section.fields.map((field) => (
                  <Row key={field.key} label={field.label}>
                    {line.specs[section.key]?.[field.key] || '—'}
                  </Row>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PackingItems({ order }: { order: Order }) {
  const t = useT()
  const [items, setItems] = React.useState<Record<string, Array<{ id: string; title: string; sku: string | null }>>>({})
  const productKey = order.lines.map((line) => line.productId).join(',')
  React.useEffect(() => {
    let cancelled = false
    Promise.all(
      order.lines.map(async (line) => {
        const call = await apiCall<{ items?: Array<{ id: string; title: string; sku: string | null }> }>(
          `/api/dermat_products/packing?productId=${encodeURIComponent(line.productId)}`,
          undefined,
          { fallback: { items: [] } },
        )
        return [line.productId, call.result?.items ?? []] as const
      }),
    ).then((entries) => {
      if (!cancelled) setItems(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey])
  return (
    <ul className="space-y-2 text-sm">
      {order.lines.map((line) => (
        <li key={line.id}>
          <span className="font-medium">{line.product?.title ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">
            {(items[line.productId] ?? []).length
              ? (items[line.productId] ?? []).map((item) => item.title.split(' - ')[0]).join(' · ')
              : t('dermat_orders.stagePage.noPacking', 'No packing items on the product yet')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function StageContext({ order, stage, materials }: { order: Order; stage: Stage; materials: OrderMaterials | null }) {
  const t = useT()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  const value = orderValue(order)
  const advanceAmount = Number(stageValue(byKey.get('advance'), 'advance_amount') ?? 0) || null
  switch (stage.key) {
    case 'advance':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('dermat_orders.stagePage.expected', 'Expected advance (40%)')}>{money(value == null ? null : value * 0.4)}</Row>
          <Row label={t('dermat_orders.view.payment', 'Payment')}>
            {[PAYMENT_TERMS_LABEL[order.paymentTerms ?? ''] ?? order.paymentTerms, order.paymentRemarks].filter(Boolean).join(' · ') || '—'}
          </Row>
          <Row label={t('dermat_orders.stagePage.gstin', 'Customer GSTIN')}>{order.customer?.gstin ?? '—'}</Row>
        </dl>
      )
    case 'sampling':
      return <SpecsBlock order={order} sections={['production']} />
    case 'artwork':
      return (
        <div className="space-y-4">
          <div>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('dermat_orders.stagePage.packingItems', 'Packing items per product')}</h4>
            <PackingItems order={order} />
          </div>
          <SpecsBlock order={order} sections={['primary', 'secondary']} />
        </div>
      )
    case 'formulation':
      return (
        <ul className="divide-y text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{line.product?.title ?? '—'}</span>
              {line.bom ? (
                <Link href={`/backend/boms/${line.bom.id}`} className="shrink-0 hover:underline">
                  <StatusBadge variant={line.bom.status === 'approved' ? 'success' : 'warning'}>
                    {`BOM v${line.bom.version} · ${line.bom.status}`}
                  </StatusBadge>
                </Link>
              ) : (
                <Link href={`/backend/boms/new?productId=${line.productId}`} className="shrink-0 text-xs text-status-warning-text hover:underline">
                  {t('dermat_orders.sheet.makeBom', 'Make BOM')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )
    case 'planning':
    case 'manufacturing':
      return (
        <div className="space-y-3">
          <dl className="divide-y">
            {order.lines.map((line) => (
              <Row key={line.id} label={line.product?.title ?? '—'}>
                {formatQty(line.quantity, 0)} pcs
                {materials?.bulkByLine[line.id] ? ` → ${formatQty(materials.bulkByLine[line.id], 2)} kg bulk` : ''}
              </Row>
            ))}
          </dl>
          <MaterialsTable materials={materials} />
        </div>
      )
    case 'filling':
    case 'packing':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.batch', 'Batch no.')}>{stageValue(byKey.get('manufacturing'), 'batch_no') ?? '—'}</Row>
          <Row label={t('dermat_orders.stagePage.bulkMade', 'Bulk made')}>
            {stageValue(byKey.get('manufacturing'), 'batch_size') ? `${stageValue(byKey.get('manufacturing'), 'batch_size')} kg` : '—'}
          </Row>
          {stage.key === 'packing' ? (
            <Row label={t('dermat_orders.stagePage.filled', 'Units filled')}>{stageValue(byKey.get('filling'), 'filled_units') ?? '—'}</Row>
          ) : null}
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {formatQty(line.quantity, 0)} pcs · {line.packSize ?? '—'}
            </Row>
          ))}
        </dl>
      )
    case 'qc_qa':
      return (
        <dl className="divide-y">
          {(['manufacturing', 'filling', 'packing'] as const).map((key) => {
            const entry = byKey.get(key)
            const def = stageDef(key)
            const ticked = def ? def.steps.filter((step) => stepStates(entry?.data)[step.key]?.done).length : 0
            return (
              <Row key={key} label={def?.label ?? key}>
                {entry?.status === 'done'
                  ? `${t('dermat_orders.stagePage.doneBy', 'Done by {name}', { name: entry.completedByName ?? '—' })} · ${ticked}/${def?.steps.length ?? 0} ${t('dermat_orders.stagePage.steps', 'steps')}`
                  : t(`dermat_orders.stageStatus.${entry?.status ?? 'waiting'}`, entry?.status ?? 'waiting')}
              </Row>
            )
          })}
          <Row label={t('dermat_orders.stagePage.packed', 'Packed')}>{stageValue(byKey.get('packing'), 'packed_qty') ?? '—'} pcs</Row>
        </dl>
      )
    case 'billing':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('dermat_orders.stagePage.advance', 'Advance received')}>{money(advanceAmount)}</Row>
          <Row label={t('dermat_orders.stagePage.balance', 'Balance to collect')}>{money(value == null ? null : value - (advanceAmount ?? 0))}</Row>
          <Row label={t('dermat_orders.form.billingRemarks', 'Billing remarks')}>{order.billingRemarks ?? '—'}</Row>
        </dl>
      )
    case 'dispatch':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.invoice', 'Invoice')}>
            {[stageValue(byKey.get('billing'), 'invoice_number'), formatDate(stageValue(byKey.get('billing'), 'invoice_date'))].filter((part) => part && part !== '—').join(' · ') || '—'}
          </Row>
          <Row label={t('dermat_orders.stagePage.balanceStatus', 'Balance payment')}>{stageValue(byKey.get('billing'), 'balance_status') ?? '—'}</Row>
          <Row label={t('dermat_orders.stagePage.contact', 'Customer contact')}>{[order.customer?.phone, order.customer?.email].filter(Boolean).join(' · ') || '—'}</Row>
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {formatQty(line.quantity, 0)} pcs
            </Row>
          ))}
          <Row label={t('dermat_orders.form.packingRemarks', 'Packing remarks')}>{order.packingRemarks ?? '—'}</Row>
        </dl>
      )
    default:
      return <p className="text-sm text-muted-foreground">{t('dermat_orders.stagePage.nothing', 'Everything for this stage is in the form.')}</p>
  }
}

function PreviousStages({ order, def }: { order: Order; def: StageDef }) {
  const t = useT()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  if (!def.after.length) return null
  return (
    <div className="space-y-4">
      {def.after.map((key) => {
        const entry = byKey.get(key)
        const prevDef = stageDef(key)
        if (!entry || !prevDef) return null
        const filled = prevDef.fields.filter((field) => stageValue(entry, field.key))
        return (
          <div key={key}>
            <div className="flex items-center justify-between gap-2">
              <Link href={`/backend/orders/${order.id}/stages/${key}`} className="text-sm font-semibold hover:underline">
                {prevDef.label}
              </Link>
              <StatusBadge variant={STAGE_VARIANT[entry.status] ?? 'neutral'}>{t(`dermat_orders.stageStatus.${entry.status}`, entry.status.replace('_', ' '))}</StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              {entry.completedByName ? `${entry.completedByName} · ` : ''}
              {entry.completedAt ? formatDateTime(entry.completedAt) : ''}
            </p>
            {filled.length ? (
              <dl>
                {filled.map((field) => (
                  <Row key={field.key} label={field.label}>
                    {field.type === 'date' ? formatDate(stageValue(entry, field.key)) : stageValue(entry, field.key)}
                  </Row>
                ))}
              </dl>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function StagePage({ orderId, stageKey }: { orderId: string; stageKey: string }) {
  const t = useT()
  const router = useRouter()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const runner = useStageAction(`dermat-stage-page-${orderId}-${stageKey}`)
  const materials = useOrderMaterials(order && (stageKey === 'planning' || stageKey === 'manufacturing') ? order : null)
  const def = stageDef(stageKey)

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

  const onAction = async (stage: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!order) return false
    const result = await runner.run(order, stage, request)
    if (result.order) {
      setOrder(result.order)
      if (request.action === 'complete' || request.action === 'skip') {
        const nextOpen = result.order.stages.find(
          (entry) => entry.status === 'open' && order.stages.find((before) => before.key === entry.key)?.status === 'waiting',
        )
        if (nextOpen) router.push(`/backend/orders/${order.id}/stages/${nextOpen.key}`)
      }
      return true
    }
    if (result.conflict) await load()
    return false
  }

  if (!def) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={t('dermat_orders.stagePage.unknown', 'Unknown stage.')} />
        </PageBody>
      </Page>
    )
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

  const stage = order.stages.find((entry) => entry.key === stageKey)!
  const index = STAGES.findIndex((entry) => entry.key === stageKey)
  const previous = index > 0 ? STAGES[index - 1] : null
  const next = index < STAGES.length - 1 ? STAGES[index + 1] : null
  const parallel = STAGES.filter((entry) => entry.key !== stageKey && entry.after.join() === def.after.join() && def.after.length > 0)
  const history = order.events.filter((event) => event.stageKey === stageKey)
  const openedNext = order.stages.filter((entry) => stageDef(entry.key)?.after.includes(stageKey))

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="space-y-3 border-b pb-4">
            <Link href={`/backend/orders/${order.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              {t('dermat_orders.stagePage.backToOrder', 'Order {no}', { no: order.orderNo })}
            </Link>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold">{def.label}</h1>
                  <StatusBadge variant={STAGE_VARIANT[stage.status] ?? 'neutral'} dot>
                    {t(`dermat_orders.stageStatus.${stage.status}`, stage.status.replace('_', ' '))}
                  </StatusBadge>
                  <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`dermat_orders.status.${order.status}`, order.status)}</StatusBadge>
                </div>
                <p className="text-sm">
                  <Link href={`/backend/orders/${order.id}`} className="font-mono font-semibold text-primary hover:underline">
                    {order.orderNo}
                  </Link>
                  {' · '}
                  <Link href={`/backend/customers/companies/${order.customerId}`} className="hover:underline">
                    {order.customer?.name ?? '—'}
                  </Link>
                  <span className="text-muted-foreground">
                    {' · '}
                    {order.lines.map((line) => `${line.product?.title ?? ''} × ${formatQty(line.quantity, 0)}`).join(', ')}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {def.department} · {def.hint}
                  {parallel.length ? ` · ${t('dermat_orders.stagePage.parallel', 'Runs alongside {stages}', { stages: parallel.map((entry) => entry.label).join(', ') })}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {previous ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/backend/orders/${order.id}/stages/${previous.key}`}>
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      {previous.label}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/backend/work/${def.key.replace('_', '-')}`}>
                    <ListChecks className="mr-1.5 h-4 w-4" />
                    {t('dermat_orders.stagePage.allOrders', 'All orders at {stage}', { stage: def.label })}
                  </Link>
                </Button>
                {next ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/backend/orders/${order.id}/stages/${next.key}`}>
                      {next.label}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <nav className="flex flex-wrap gap-1.5" aria-label={t('dermat_orders.stagePage.map', 'All stages of this order')}>
              {order.stages.map((entry) => (
                <Link
                  key={entry.key}
                  href={`/backend/orders/${order.id}/stages/${entry.key}`}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted', entry.status === 'waiting' && 'opacity-50', entry.key === stageKey && 'border-primary bg-primary/10 font-semibold text-primary opacity-100')}
                >
                  <span
                    className={cn(
                      'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
                      entry.status === 'done' || entry.status === 'skipped'
                        ? 'bg-status-success-icon'
                        : entry.status === 'open'
                          ? 'bg-status-warning-icon'
                          : entry.status === 'on_hold'
                            ? 'bg-status-error-icon'
                            : 'bg-muted-foreground/40',
                    )}
                  />
                  {entry.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <Card className="overflow-hidden lg:col-span-7">
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <ListChecks className="h-4 w-4 text-primary" />
                  {t('dermat_orders.stagePage.work', 'Work on this stage')}
                </CardTitle>
              </CardHeader>
              <StageWorkArea
                order={order}
                stage={stage}
                people={people}
                canWork
                busy={runner.busy}
                shortCount={materials ? materials.rows.filter((row) => row.quantity > row.onHand).length : null}
                onAction={onAction}
                variant="page"
              />
              {stage.status === 'done' && openedNext.length ? (
                <div className="border-t bg-status-success-bg px-4 py-3 text-sm text-status-success-text">
                  {t('dermat_orders.stagePage.movedOn', 'Moved on to: ')}
                  {openedNext.map((entry, position) => (
                    <React.Fragment key={entry.key}>
                      {position > 0 ? ', ' : ''}
                      <Link href={`/backend/orders/${order.id}/stages/${entry.key}`} className="font-semibold underline">
                        {entry.label} ({entry.department})
                      </Link>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </Card>

            <div className="space-y-5 lg:col-span-5">
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    {stageKey === 'planning' || stageKey === 'manufacturing' ? <Layers className="h-4 w-4 text-primary" /> : <Package className="h-4 w-4 text-primary" />}
                    {t('dermat_orders.stagePage.needs', 'What this stage needs')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <StageContext order={order} stage={stage} materials={materials} />
                </CardContent>
              </Card>

              {def.after.length ? (
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold">
                      <Info className="h-4 w-4 text-primary" />
                      {t('dermat_orders.stagePage.before', 'Before this stage')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <PreviousStages order={order} def={def} />
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <History className="h-4 w-4 text-primary" />
                    {t('dermat_orders.stagePage.history', 'History of this stage')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {history.length ? (
                    <ol className="divide-y text-sm">
                      {history.map((event) => (
                        <li key={event.id} className="px-4 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{t(`dermat_orders.event.${event.action}`, EVENT_LABEL[event.action] ?? event.action)}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.at)}</span>
                          </div>
                          {event.note ? <p className="text-xs">{event.note}</p> : null}
                          {event.byName ? <p className="text-xs text-muted-foreground">{event.byName}</p> : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">{t('dermat_orders.stagePage.noHistory', 'Nothing has happened at this stage yet.')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default StagePage
