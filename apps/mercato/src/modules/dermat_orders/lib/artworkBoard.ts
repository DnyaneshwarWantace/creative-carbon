import { DermatOrder, DermatOrderStage } from '../data/entities'
import { loadCustomers, type OrderContext } from './server'
import { packItems } from './productionStock'
import { stageDef } from './stages'

const DAY_MS = 86400000

export async function artworkBoard(ctx: OrderContext, filter: { includeDone?: boolean } = {}) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const stageStatuses = filter.includeDone ? ['waiting', 'open', 'on_hold', 'done'] : ['open', 'on_hold']
  const stages = await ctx.em.find(DermatOrderStage, { ...scope, stageKey: 'artwork', status: { $in: stageStatuses } }, { limit: 300 })
  const orderIds = [...new Set(stages.map((stage) => stage.orderId))]
  if (!orderIds.length) return { jobs: [], items: [] }
  const orders = await ctx.em.find(DermatOrder, { id: { $in: orderIds }, ...scope, deletedAt: null, status: { $nin: ['cancelled'] } })
  const customers = await loadCustomers(ctx, orders.map((order) => order.customerId))
  const steps = stageDef('artwork')?.steps ?? []
  const jobs: Array<Record<string, unknown>> = []
  const items: Array<Record<string, unknown>> = []
  for (const stage of stages) {
    const order = orders.find((entry) => entry.id === stage.orderId)
    if (!order) continue
    const data = stage.data ?? {}
    const ticks = (data.__steps as Record<string, { done?: boolean; at?: string; by?: string | null }> | undefined) ?? {}
    const doneSteps = steps.filter((step) => ticks[step.key]?.done)
    const next = steps.find((step) => !ticks[step.key]?.done) ?? null
    const pm = (data.__pm as Record<string, { status?: string; note?: string | null; at?: string; by?: string | null }> | undefined) ?? {}
    const packing = await packItems(ctx, order.id)
    const base = { orderId: order.id, orderNo: order.orderNo, customer: customers.get(order.customerId)?.name ?? null, priority: order.priority, deliveryDate: order.deliveryDate ?? null }
    jobs.push({
      ...base,
      status: stage.status,
      designerStatus: typeof data.designer_status === 'string' ? data.designer_status : null,
      note: typeof data.status_note === 'string' ? data.status_note : stage.holdReason ?? null,
      steps: steps.map((step) => ({ key: step.key, label: step.label, done: Boolean(ticks[step.key]?.done), at: ticks[step.key]?.at ?? null })),
      progress: `${doneSteps.length}/${steps.length}`,
      next: next?.label ?? null,
      responsibleName: stage.responsibleName ?? null,
      days: stage.openedAt ? Math.floor((Date.now() - stage.openedAt.getTime()) / DAY_MS) : null,
      itemsReady: packing.filter((item) => ['PM OK', 'Half PM OK'].includes(pm[item.productId]?.status ?? '')).length,
      itemsTotal: packing.length,
    })
    for (const item of packing) {
      const entry = pm[item.productId]
      items.push({ ...base, stageStatus: stage.status, productId: item.productId, title: item.title, code: item.code, unit: item.unit, quantity: item.quantity, status: entry?.status ?? null, note: entry?.note ?? null, at: entry?.at ?? null, by: entry?.by ?? null })
    }
  }
  jobs.sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || String(a.deliveryDate ?? '9999').localeCompare(String(b.deliveryDate ?? '9999')))
  return { jobs, items }
}
