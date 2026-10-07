import { CcOrder, CcOrderStage } from '../data/entities'
import { loadCustomers, type OrderContext } from './server'

export type SalesTaskKind = 'client_hold' | 'advance' | 'delivery_late' | 'delivery_soon' | 'not_delivered'

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
  const orders = await ctx.em.find(CcOrder, { ...scope, status: { $nin: ['cancelled'] } }, { orderBy: { orderDate: 'desc' }, limit: 500 })
  const mine = filter.mine?.trim().toLowerCase()
  const relevant = mine ? orders.filter((order) => (order.salesManager ?? '').toLowerCase().includes(mine)) : orders
  const ids = relevant.map((order) => order.id)
  if (!ids.length) return { tasks: [] as SalesTask[], counts: {} as Record<string, number> }
  const [stages, customers] = await Promise.all([
    ctx.em.find(CcOrderStage, { orderId: { $in: ids } }),
    loadCustomers(ctx, relevant.map((order) => order.customerId)),
  ])
  const today = todayIso()
  const tasks: SalesTask[] = []
  for (const order of relevant) {
    const base = { orderId: order.id, orderNo: order.orderNo, customer: customers.get(order.customerId)?.name ?? null, priority: order.priority }
    const own = stages.filter((stage) => stage.orderId === order.id)
    const stage = (key: string) => own.find((entry) => entry.stageKey === key)
    const completed = order.status === 'completed'
    for (const held of own.filter((entry) => entry.status === 'on_hold' && (entry.holdParty ?? '').toLowerCase().startsWith('customer'))) {
      const followUp = typeof held.data?.__follow_up === 'string' ? held.data.__follow_up : null
      tasks.push({ ...base, kind: 'client_hold', stageKey: held.stageKey, detail: [held.holdReason ?? '', followUp ? `follow up ${followUp}${followUp < today ? ' (overdue)' : ''}` : null].filter(Boolean).join(' · '), days: daysSince(held.updatedAt) })
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
    const dispatch = stage('dispatch')
    if (dispatch && dispatch.status === 'done' && !dispatch.data?.delivered_on) {
      tasks.push({ ...base, kind: 'not_delivered', stageKey: 'dispatch', detail: `Despatched ${String(dispatch.data?.dispatch_date ?? '')}, delivery not confirmed`, days: daysSince(dispatch.completedAt ?? null) })
    }
  }
  tasks.sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || (b.days ?? 0) - (a.days ?? 0))
  const counts: Record<string, number> = {}
  for (const task of tasks) counts[task.kind] = (counts[task.kind] ?? 0) + 1
  return { tasks, counts }
}
