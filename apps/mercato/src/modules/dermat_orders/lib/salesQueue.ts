import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { loadCustomers, loadProducts, type OrderContext } from './server'

export type SalesTaskKind = 'client_hold' | 'sample_feedback' | 'artwork_client' | 'advance' | 'delivery_late' | 'delivery_soon' | 'sample_no_rd' | 'not_delivered'

export type SalesTask = {
  kind: SalesTaskKind
  orderId: string
  orderNo: string
  customer: string | null
  priority: string
  stageKey: string | null
  detail: string
  days: number | null
}

const DAY_MS = 86400000

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function daysSince(value: Date | null | undefined): number | null {
  if (!value) return null
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / DAY_MS))
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export async function salesQueue(ctx: OrderContext, filter: { mine?: string | null } = {}) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  const orders = await ctx.em.find(DermatOrder, { ...scope, status: { $nin: ['cancelled'] } }, { orderBy: { orderDate: 'desc' }, limit: 500 })
  const mine = filter.mine?.trim().toLowerCase()
  const relevant = mine ? orders.filter((order) => (order.salesManager ?? '').toLowerCase().includes(mine)) : orders
  const ids = relevant.map((order) => order.id)
  if (!ids.length) return { tasks: [] as SalesTask[], counts: {} as Record<string, number> }
  const [stages, lines, customers] = await Promise.all([
    ctx.em.find(DermatOrderStage, { orderId: { $in: ids } }),
    ctx.em.find(DermatOrderLine, { orderId: { $in: ids } }),
    loadCustomers(ctx, relevant.map((order) => order.customerId)),
  ])
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const today = todayIso()
  const tasks: SalesTask[] = []
  for (const order of relevant) {
    const base = { orderId: order.id, orderNo: order.orderNo, customer: customers.get(order.customerId)?.name ?? null, priority: order.priority }
    const own = stages.filter((stage) => stage.orderId === order.id)
    const stage = (key: string) => own.find((entry) => entry.stageKey === key)
    const completed = order.status === 'completed'
    for (const held of own.filter((entry) => entry.status === 'on_hold' && (entry.holdParty ?? '').toLowerCase().startsWith('client'))) {
      tasks.push({ ...base, kind: 'client_hold', stageKey: held.stageKey, detail: held.holdReason ?? '', days: daysSince(held.updatedAt) })
    }
    const sampling = stage('sampling')
    if (sampling && sampling.status === 'open') {
      const feedback = String(sampling.data?.client_feedback ?? '')
      const steps = (sampling.data?.__steps as Record<string, { done?: boolean; at?: string }> | undefined) ?? {}
      if (steps.sample_sent?.done && feedback !== 'Approved') {
        tasks.push({ ...base, kind: 'sample_feedback', stageKey: 'sampling', detail: feedback ? `Client said: ${feedback}` : 'Sample sent, no feedback yet', days: steps.sample_sent.at ? daysSince(new Date(steps.sample_sent.at)) : null })
      }
    }
    const artwork = stage('artwork')
    if (artwork && (artwork.status === 'open' || artwork.status === 'on_hold')) {
      const pm = (artwork.data?.__pm as Record<string, { status?: string; at?: string }> | undefined) ?? {}
      const waiting = Object.entries(pm).filter(([, value]) => (value.status ?? '').toLowerCase() === 'client side')
      if (waiting.length) {
        tasks.push({ ...base, kind: 'artwork_client', stageKey: 'artwork', detail: `${waiting.length} packing item(s) waiting on the client`, days: waiting[0][1].at ? daysSince(new Date(waiting[0][1].at)) : null })
      }
    }
    const advance = stage('advance')
    if (advance && advance.status === 'open') {
      tasks.push({ ...base, kind: 'advance', stageKey: 'advance', detail: 'Advance not received yet', days: daysSince(advance.openedAt ?? null) })
    }
    if (!completed && order.deliveryDate) {
      const left = daysBetween(today, order.deliveryDate)
      if (left < 0) tasks.push({ ...base, kind: 'delivery_late', stageKey: null, detail: `Delivery date ${order.deliveryDate} passed`, days: -left })
      else if (left <= 7) tasks.push({ ...base, kind: 'delivery_soon', stageKey: null, detail: `Delivery due ${order.deliveryDate}`, days: left })
    }
    for (const line of lines.filter((entry) => entry.orderId === order.id && entry.sampleNeeded && !entry.rdNumber)) {
      tasks.push({ ...base, kind: 'sample_no_rd', stageKey: 'sampling', detail: `${products.get(line.productId)?.title ?? 'A product'} needs a sample but has no R&D number`, days: daysSince(order.createdAt) })
    }
    const dispatch = stage('dispatch')
    if (dispatch && dispatch.status === 'done' && !dispatch.data?.delivered_on) {
      tasks.push({ ...base, kind: 'not_delivered', stageKey: 'dispatch', detail: `Dispatched ${String(dispatch.data?.dispatch_date ?? '')}, delivery not confirmed`, days: daysSince(dispatch.completedAt ?? null) })
    }
  }
  tasks.sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || (b.days ?? 0) - (a.days ?? 0))
  const counts: Record<string, number> = {}
  for (const task of tasks) counts[task.kind] = (counts[task.kind] ?? 0) + 1
  return { tasks, counts }
}
