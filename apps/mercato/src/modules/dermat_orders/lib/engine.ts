import { DermatOrder, DermatOrderEvent, DermatOrderLine, DermatOrderStage } from '../data/entities'
import type { StageActionInput } from '../data/validators'
import { DESIGNER_STATUSES, STAGES, isFinished, missingRequired, missingSteps, stageDef, stepStates } from './stages'
import { blockingChecks, checksForOrder, ensureChecksForStage, retireStageChecks, type StageQcSummary } from '../../dermat_quality/lib/service'
import { requestsForOrder, storeBlocking } from '../../dermat_store/lib/service'
import { reservationsForOrder } from '../../dermat_planning/lib/service'
import { USE_EXISTING_BULK, existingBulkProblem, packItems } from './productionStock'
import { paymentView, paymentsFor, received, recordAdvanceFromStage } from '../../dermat_accounts/lib/service'
import { priceLine, priceOrder } from './pricing'

function pricedLine(line: DermatOrderLine) {
  return { quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) }
}
import {
  OrderError,
  approvedPackBoms,
  bulkForProducts,
  currentUserName,
  loadCustomers,
  loadProducts,
  userNames,
  type OrderContext,
} from './server'

const DAY_MS = 24 * 60 * 60 * 1000

export function logEvent(ctx: OrderContext, order: DermatOrder, action: string, stageKey: string | null, note: string | null, byName: string | null) {
  ctx.em.persist(
    ctx.em.create(DermatOrderEvent, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderId: order.id,
      stageKey,
      action,
      note,
      byName,
    }),
  )
}

export function createStages(ctx: OrderContext, order: DermatOrder, byName: string | null): DermatOrderStage[] {
  const now = new Date()
  return STAGES.map((def) => {
    const isFirst = def.after.length === 0
    const stage = ctx.em.create(DermatOrderStage, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderId: order.id,
      stageKey: def.key,
      status: isFirst ? 'done' : 'waiting',
      openedAt: isFirst ? now : null,
      completedAt: isFirst ? now : null,
      completedByName: isFirst ? byName : null,
      data: {},
    })
    ctx.em.persist(stage)
    return stage
  })
}

export function openReadyStages(stages: DermatOrderStage[]): string[] {
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage]))
  const opened: string[] = []
  for (const def of STAGES) {
    const stage = byKey.get(def.key)
    if (!stage || stage.status !== 'waiting') continue
    if (def.after.every((key) => isFinished(byKey.get(key)?.status))) {
      stage.status = 'open'
      stage.openedAt = new Date()
      opened.push(def.key)
    }
  }
  return opened
}

function dependents(key: string): string[] {
  const result = new Set<string>()
  const walk = (current: string) => {
    for (const def of STAGES) {
      if (def.after.includes(current) && !result.has(def.key)) {
        result.add(def.key)
        walk(def.key)
      }
    }
  }
  walk(key)
  return Array.from(result)
}

export function orderStatusFromStages(order: DermatOrder, stages: DermatOrderStage[]): DermatOrder['status'] {
  if (order.status === 'cancelled') return 'cancelled'
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage.status]))
  if (isFinished(byKey.get('dispatch'))) return 'completed'
  if (isFinished(byKey.get('advance'))) return 'confirmed'
  return 'booked'
}

async function afterOpened(ctx: OrderContext, order: DermatOrder, opened: string[], byName: string | null) {
  if (!opened.length) return
  const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
  for (const key of opened) {
    logEvent(ctx, order, 'opened', key, null, null)
    const created = await ensureChecksForStage(ctx, {
      orderId: order.id,
      orderNo: order.orderNo,
      stageKey: key,
      productIds: key === 'manufacturing' ? await bulkForProducts(ctx, lines.map((line) => line.productId)) : lines.map((line) => line.productId),
      byName,
    })
    if (created) logEvent(ctx, order, 'qc_created', key, `${created} QC check${created > 1 ? 's' : ''} sent to QC`, null)
  }
}

export async function applyStageAction(ctx: OrderContext, order: DermatOrder, input: StageActionInput): Promise<void> {
  const def = stageDef(input.stageKey)
  if (!def) throw new OrderError('Unknown stage')
  if (order.status === 'cancelled') throw new OrderError('This order is cancelled', 409)
  const stages = await ctx.em.find(DermatOrderStage, { orderId: order.id })
  const stage = stages.find((entry) => entry.stageKey === def.key)
  if (!stage) throw new OrderError('Stage not found', 404)
  const byName = await currentUserName(ctx)
  const note = input.note?.trim() || null
  const mergeData = () => {
    if (!input.data) return
    const next: Record<string, unknown> = { ...(stage.data ?? {}) }
    for (const [key, value] of Object.entries(input.data)) {
      if (!def.fields.some((field) => field.key === key)) continue
      next[key] = typeof value === 'string' ? value.trim() : value
    }
    stage.data = next
  }

  switch (input.action) {
    case 'assign': {
      const userId = input.responsibleUserId ?? null
      stage.responsibleUserId = userId
      stage.responsibleName = userId ? ((await userNames(ctx, [userId])).get(userId) ?? null) : null
      logEvent(ctx, order, 'assigned', def.key, stage.responsibleName ?? 'Nobody', byName)
      break
    }
    case 'step': {
      const step = def.steps.find((entry) => entry.key === input.stepKey)
      if (!step) throw new OrderError('Unknown step')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      const done = input.done !== false
      const states = { ...stepStates(stage.data), [step.key]: { done, at: done ? new Date().toISOString() : null, by: done ? byName : null } }
      stage.data = { ...(stage.data ?? {}), __steps: states }
      logEvent(ctx, order, done ? 'step_done' : 'step_undone', def.key, step.label, byName)
      break
    }
    case 'pm_status': {
      if (def.key !== 'artwork') throw new OrderError('Packing item status belongs to Artwork & packaging')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      if (!input.productId || !input.pmStatus || !DESIGNER_STATUSES.includes(input.pmStatus)) throw new OrderError('Pick a packing item and a status')
      const item = (await packItems(ctx, order.id)).find((entry) => entry.productId === input.productId)
      if (!item) throw new OrderError('That packing item is not on this order', 404)
      const current = (stage.data?.__pm as Record<string, unknown> | undefined) ?? {}
      stage.data = { ...(stage.data ?? {}), __pm: { ...current, [item.productId]: { status: input.pmStatus, note: note ?? null, at: new Date().toISOString(), by: byName } } }
      logEvent(ctx, order, 'pm_status', def.key, `${item.title}: ${input.pmStatus}${note ? ` (${note})` : ''}`, byName)
      break
    }
    case 'new_round': {
      if (def.key !== 'sampling') throw new OrderError('Sample rounds belong to Sampling / R&D')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      if (!note) throw new OrderError('Write what the client asked to change')
      const rounds = Array.isArray(stage.data?.__rounds) ? (stage.data?.__rounds as Array<Record<string, unknown>>) : []
      const steps = { ...stepStates(stage.data) }
      for (const key of ['sample_made', 'sample_sent', 'client_ok']) steps[key] = { done: false, at: null, by: null }
      stage.data = { ...(stage.data ?? {}), client_feedback: null, __steps: steps, __rounds: [...rounds, { round: rounds.length + 1, feedback: note, at: new Date().toISOString(), by: byName }] }
      logEvent(ctx, order, 'sample_round', def.key, `Round ${rounds.length + 2}: ${note}`, byName)
      break
    }
    case 'save': {
      if (stage.status === 'waiting') throw new OrderError(`${def.label} has not started yet`, 409)
      if (isFinished(stage.status)) throw new OrderError(`${def.label} is finished. Reopen it to change it.`, 409)
      mergeData()
      logEvent(ctx, order, 'saved', def.key, note, byName)
      break
    }
    case 'complete': {
      if (stage.status === 'waiting') throw new OrderError(`${def.label} has not started yet`, 409)
      if (stage.status === 'on_hold') throw new OrderError(`${def.label} is on hold. Resume it first.`, 409)
      if (isFinished(stage.status)) throw new OrderError(`${def.label} is already finished`, 409)
      mergeData()
      const missing = missingRequired(def, stage.data ?? {})
      if (missing.length) throw new OrderError(`Fill in: ${missing.join(', ')}`, 400, { missing })
      const openSteps = missingSteps(def, stage.data)
      if (openSteps.length) throw new OrderError(`Tick these steps first: ${openSteps.join(', ')}`, 400, { steps: openSteps })
      if (def.key === 'sampling' && stage.data?.client_feedback !== 'Approved') {
        throw new OrderError('The client has not approved the sample. Set feedback to Approved, or start another round with their changes.', 400)
      }
      if (def.key === 'artwork') {
        const items = await packItems(ctx, order.id)
        const statuses = (stage.data?.__pm as Record<string, { status?: string }> | undefined) ?? {}
        const notReady = items.filter((item) => !['PM OK', 'Half PM OK'].includes(statuses[item.productId]?.status ?? ''))
        if (notReady.length) {
          throw new OrderError(`Packing material not ready: ${notReady.map((item) => `${item.title} (${statuses[item.productId]?.status ?? 'no status'})`).join(', ')}`, 400, { pm: notReady.map((item) => item.productId) })
        }
      }
      const reusingBulk = def.key === 'manufacturing' && stage.data?.bulk_source === USE_EXISTING_BULK
      if (reusingBulk) {
        const problem = await existingBulkProblem(ctx, order.id, String(stage.data?.batch_no ?? '').trim())
        if (problem) throw new OrderError(problem, 400, { bulk: true })
        await retireStageChecks(ctx, order.id, def.key, `Bulk taken from batch ${String(stage.data?.batch_no ?? '')}, already QC-approved`)
      }
      const storeBlock = reusingBulk ? null : await storeBlocking(ctx, order.id, def.key)
      if (storeBlock) throw new OrderError(storeBlock, 400, { store: true })
      const qcBlocking = reusingBulk ? [] : await blockingChecks(ctx, order.id, def.key)
      if (qcBlocking.length) {
        throw new OrderError(`QC has not passed yet: ${qcBlocking.map((check) => `${check.code} (${check.status})`).join(', ')}`, 400, { qc: qcBlocking.map((check) => check.id) })
      }
      if (def.key === 'formulation') {
        const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
        const boms = await approvedPackBoms(
          ctx,
          lines.map((line) => line.productId),
        )
        const products = await loadProducts(
          ctx,
          lines.map((line) => line.productId),
        )
        const without = lines.filter((line) => boms.get(line.productId)?.status !== 'approved').map((line) => products.get(line.productId)?.title ?? 'a product')
        if (without.length) throw new OrderError(`Approve the BOM first for: ${without.join(', ')}`, 400)
      }
      if (def.key === 'dispatch') {
        const orderLines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
        const totals = priceOrder(orderLines.map(pricedLine), order.pricesIncludeGst)
        const paid = received(await paymentsFor(ctx, [order.id]))
        const due = Math.round((totals.total - paid) * 100) / 100
        const override = String(stage.data?.dispatch_override ?? '').trim()
        if (due > 0.5 && !override) {
          throw new OrderError(`₹${due.toLocaleString('en-IN')} is still due on this order. Record the payment in Accounts, or write a reason under "Dispatch before full payment".`, 400, { due })
        }
        if (due > 0.5) logEvent(ctx, order, 'payment_override', def.key, `Dispatched with ₹${due.toLocaleString('en-IN')} due: ${override}`, byName)
      }
      stage.status = 'done'
      stage.completedAt = new Date()
      stage.completedByName = byName
      stage.holdReason = null
      stage.holdParty = null
      logEvent(ctx, order, 'completed', def.key, note, byName)
      if (def.key === 'advance' && (await recordAdvanceFromStage(ctx, order, stage.data ?? {}, byName))) {
        logEvent(ctx, order, 'payment', def.key, `Advance ₹${Number(stage.data?.advance_amount).toLocaleString('en-IN')} recorded in Accounts`, byName)
      }
      await afterOpened(ctx, order, openReadyStages(stages), byName)
      break
    }
    case 'skip': {
      if (!def.canSkip) throw new OrderError(`${def.label} cannot be skipped`)
      if (stage.status !== 'open') throw new OrderError(`${def.label} is not open`, 409)
      stage.status = 'skipped'
      stage.completedAt = new Date()
      stage.completedByName = byName
      logEvent(ctx, order, 'skipped', def.key, note, byName)
      await afterOpened(ctx, order, openReadyStages(stages), byName)
      break
    }
    case 'hold': {
      if (stage.status !== 'open') throw new OrderError(`Only an open stage can be put on hold`, 409)
      if (!note) throw new OrderError('Write why it is on hold')
      stage.status = 'on_hold'
      stage.holdReason = note
      stage.holdParty = input.holdParty?.trim() || null
      mergeData()
      logEvent(ctx, order, 'held', def.key, [stage.holdParty, note].filter(Boolean).join(' · '), byName)
      break
    }
    case 'resume': {
      if (stage.status !== 'on_hold') throw new OrderError(`${def.label} is not on hold`, 409)
      stage.status = 'open'
      stage.holdReason = null
      stage.holdParty = null
      logEvent(ctx, order, 'resumed', def.key, note, byName)
      break
    }
    case 'revert': {
      if (!isFinished(stage.status)) throw new OrderError(`${def.label} is not finished`, 409)
      if (!note) throw new OrderError('Write why it is being reopened')
      const later = dependents(def.key)
      const blocking = stages.filter((entry) => later.includes(entry.stageKey) && isFinished(entry.status))
      if (blocking.length) {
        const labels = blocking.map((entry) => stageDef(entry.stageKey)?.label ?? entry.stageKey)
        throw new OrderError(`Reopen these first: ${labels.join(', ')}`, 409)
      }
      stage.status = 'open'
      stage.completedAt = null
      stage.completedByName = null
      for (const entry of stages) {
        if (later.includes(entry.stageKey) && (entry.status === 'open' || entry.status === 'on_hold')) {
          entry.status = 'waiting'
          entry.openedAt = null
        }
      }
      logEvent(ctx, order, 'reverted', def.key, note, byName)
      break
    }
  }
  order.status = orderStatusFromStages(order, stages)
  order.updatedAt = new Date()
}

export type StageView = {
  key: string
  label: string
  department: string
  hint: string
  status: string
  responsibleUserId: string | null
  responsibleName: string | null
  data: Record<string, unknown>
  holdReason: string | null
  holdParty: string | null
  openedAt: string | null
  completedAt: string | null
  completedByName: string | null
  days: number | null
}

export function stageViews(stages: DermatOrderStage[]): StageView[] {
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage]))
  const now = Date.now()
  return STAGES.map((def) => {
    const stage = byKey.get(def.key)
    const opened = stage?.openedAt ? stage.openedAt.getTime() : null
    const closed = stage?.completedAt ? stage.completedAt.getTime() : null
    return {
      key: def.key,
      label: def.label,
      department: def.department,
      hint: def.hint,
      status: stage?.status ?? 'waiting',
      responsibleUserId: stage?.responsibleUserId ?? null,
      responsibleName: stage?.responsibleName ?? null,
      data: (stage?.data as Record<string, unknown>) ?? {},
      holdReason: stage?.holdReason ?? null,
      holdParty: stage?.holdParty ?? null,
      openedAt: stage?.openedAt ? stage.openedAt.toISOString() : null,
      completedAt: stage?.completedAt ? stage.completedAt.toISOString() : null,
      completedByName: stage?.completedByName ?? null,
      days: opened == null ? null : Math.max(0, Math.round((((closed ?? now) - opened) / DAY_MS) * 10) / 10),
    }
  })
}

export async function serializeOrder(ctx: OrderContext, order: DermatOrder) {
  const [lines, stages, events] = await Promise.all([
    ctx.em.find(DermatOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } }),
    ctx.em.find(DermatOrderStage, { orderId: order.id }),
    ctx.em.find(DermatOrderEvent, { orderId: order.id }, { orderBy: { createdAt: 'desc' }, limit: 200 }),
  ])
  const productIds = lines.map((line) => line.productId)
  const [customers, products, boms, qc, store, reservations, payments] = await Promise.all([
    loadCustomers(ctx, [order.customerId]),
    loadProducts(ctx, productIds),
    approvedPackBoms(ctx, productIds),
    checksForOrder(ctx, order.id),
    requestsForOrder(ctx, order.id),
    reservationsForOrder(ctx, order.id),
    paymentsFor(ctx, [order.id]),
  ])
  const qcOnly = Object.values(qc).flat().map((check) => check.productId).filter((id) => !products.has(id))
  if (qcOnly.length) for (const [id, product] of await loadProducts(ctx, qcOnly)) products.set(id, product)
  const views = stageViews(stages)
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    deliveryDate: order.deliveryDate ?? null,
    customerId: order.customerId,
    customer: customers.get(order.customerId) ?? null,
    customerPoRef: order.customerPoRef ?? null,
    orderType: order.orderType,
    sourceOrderId: order.sourceOrderId ?? null,
    salesManager: order.salesManager ?? null,
    paymentTerms: order.paymentTerms ?? null,
    paymentRemarks: order.paymentRemarks ?? null,
    productRemarks: order.productRemarks ?? null,
    billingRemarks: order.billingRemarks ?? null,
    packingRemarks: order.packingRemarks ?? null,
    status: order.status,
    onHold: views.some((stage) => stage.status === 'on_hold'),
    createdByName: order.createdByName ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    linesLocked: views.some((stage) => stage.key === 'manufacturing' && isFinished(stage.status)),
    lines: lines.map((line) => ({
      id: line.id,
      position: line.position,
      productId: line.productId,
      product: products.get(line.productId) ?? null,
      bom: boms.get(line.productId) ?? null,
      brandName: line.brandName ?? null,
      packSize: line.packSize ?? null,
      mrp: line.mrp == null ? null : Number(line.mrp),
      quantity: Number(line.quantity),
      rate: line.rate == null ? null : Number(line.rate),
      gstPercent: Number(line.gstPercent ?? 18),
      discountPercent: Number(line.discountPercent ?? 0),
      price: priceLine(pricedLine(line), order.pricesIncludeGst),
      batchNo: line.batchNo ?? null,
      specs: line.specs ?? {},
    })),
    pricesIncludeGst: order.pricesIncludeGst,
    totals: priceOrder(lines.map(pricedLine), order.pricesIncludeGst),
    payments: (() => {
      const total = priceOrder(lines.map(pricedLine), order.pricesIncludeGst).total
      const paid = received(payments)
      return { received: paid, due: Math.round((total - paid) * 100) / 100, items: payments.map(paymentView) }
    })(),
    stages: views,
    qc: Object.fromEntries(
      Object.entries(qc).map(([key, list]) => [
        key,
        list.map((check: StageQcSummary) => ({ ...check, productTitle: products.get(check.productId)?.title ?? '' })),
      ]),
    ),
    store,
    reservations,
    packItems: await packItems(ctx, order.id),
    events: events.map((event) => ({
      id: event.id,
      stageKey: event.stageKey ?? null,
      action: event.action,
      note: event.note ?? null,
      byName: event.byName ?? null,
      at: event.createdAt.toISOString(),
    })),
  }
}
