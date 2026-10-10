import { resolveOrderAccess, trimEvents, trimStages } from './visibility'
import { CcOrder, CcOrderEvent, CcOrderLine, CcOrderStage, type FieldChange } from '../data/entities'
import type { StageActionInput } from '../data/validators'
import { orderHeadline, STAGES, STOCK_STAGES, applyDayLimit, applyReopenHours, applyStageOverride, isFinished, missingRequired, missingSteps, reopenBlock, stageDef, stageReopenHours, stepStates, type ReopenInfo } from './stages'
import { qcGate, reverseSaleOut, saleOut } from './fulfilment'
import { effectiveStageDef, loadStageOverrides, type StageOverrides } from './stageSettings'
import { paymentView, paymentsFor, received, recordAdvanceFromStage } from '../../cc_accounts/lib/service'
import { priceLine, priceOrder } from './pricing'
import { canSeeMoney, isMoneyEvent, isMoneyStageField, withoutMoneyFields } from './money'
import { documentCounts, documentStatus, missingDocuments } from './stageDocuments'
import { OrderError, currentUserName, loadCustomers, loadProducts, userNames, type OrderContext } from './server'

function pricedLine(line: CcOrderLine) {
  return { quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) }
}

const DAY_MS = 24 * 60 * 60 * 1000

function comparable(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  const text = String(value).trim()
  return text === '' ? null : text
}

export function logEvent(ctx: OrderContext, order: CcOrder, action: string, stageKey: string | null, note: string | null, byName: string | null, changes: FieldChange[] = []) {
  ctx.em.persist(
    ctx.em.create(CcOrderEvent, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderId: order.id,
      stageKey,
      action,
      note,
      byName,
      changes: changes.length ? changes : null,
    }),
  )
}

export function createStages(ctx: OrderContext, order: CcOrder, byName: string | null): CcOrderStage[] {
  const now = new Date()
  return STAGES.map((def) => {
    const isFirst = def.after.length === 0
    const stage = ctx.em.create(CcOrderStage, {
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

export function openReadyStages(stages: CcOrderStage[]): string[] {
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

export function orderStatusFromStages(order: CcOrder, stages: CcOrderStage[]): CcOrder['status'] {
  if (order.status === 'cancelled') return 'cancelled'
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage.status]))
  if (isFinished(byKey.get('dispatch'))) return 'completed'
  if (isFinished(byKey.get('advance'))) return 'confirmed'
  return 'booked'
}

export async function assignDefaultPeople(ctx: OrderContext, order: CcOrder, stages: CcOrderStage[], opened: string[]) {
  if (!opened.length) return
  const overrides = await loadStageOverrides(ctx)
  for (const key of opened) {
    const override = overrides.get(key)
    const stage = stages.find((entry) => entry.stageKey === key)
    if (!stage || stage.responsibleUserId || !override?.defaultUserId) continue
    stage.responsibleUserId = override.defaultUserId
    stage.responsibleName = override.defaultUserName ?? null
    logEvent(ctx, order, 'assigned', key, `${override.defaultUserName ?? 'Default person'} (automatic)`, null)
  }
}

async function afterOpened(ctx: OrderContext, order: CcOrder, opened: string[], stages: CcOrderStage[] = []) {
  for (const key of opened) logEvent(ctx, order, 'opened', key, null, null)
  await assignDefaultPeople(ctx, order, stages, opened)
}

export function reopenInfo(order: { status: string }, stages: CcOrderStage[], stageKey: string, overrides?: StageOverrides): ReopenInfo {
  const stage = stages.find((entry) => entry.stageKey === stageKey)
  const hours = overrides ? applyReopenHours(overrides.get(stageKey)) : stageReopenHours(stageKey)
  const next = STAGES.filter((def) => def.after.includes(stageKey)).map((def) => def.key)
  const nextStarted = stages
    .filter((entry) => next.includes(entry.stageKey) && (entry.status === 'on_hold' || (entry.status === 'open' && Boolean((entry.data as Record<string, unknown> | null)?.__started))))
    .map((entry) => (overrides ? effectiveStageDef(entry.stageKey, overrides) : stageDef(entry.stageKey))?.department ?? entry.stageKey)
  return {
    until: stage?.completedAt && hours > 0 ? new Date(stage.completedAt.getTime() + hours * 3600000).toISOString() : null,
    stockMoved: STOCK_STAGES.includes(stageKey) && stage?.status === 'done',
    nextStarted: Array.from(new Set(nextStarted)),
    orderClosed: order.status === 'completed',
  }
}

export async function applyStageAction(ctx: OrderContext, order: CcOrder, input: StageActionInput, options: { reopenAnyTime?: boolean; money?: boolean } = {}): Promise<string[]> {
  const reverted: string[] = []
  const overrides = await loadStageOverrides(ctx)
  const def = effectiveStageDef(input.stageKey, overrides)
  if (!def) throw new OrderError('Unknown stage')
  if (order.status === 'cancelled') throw new OrderError('This order is cancelled', 409)
  if (order.heldAt && !['revert', 'assign', 'save'].includes(input.action)) throw new OrderError(`The order is on hold: ${order.holdReason ?? ''}. Release it first.`, 409)
  const stages = await ctx.em.find(CcOrderStage, { orderId: order.id })
  const stage = stages.find((entry) => entry.stageKey === def.key)
  if (!stage) throw new OrderError('Stage not found', 404)
  const byName = await currentUserName(ctx)
  const note = input.note?.trim() || null
  const changed: FieldChange[] = []
  const mergeData = () => {
    if (!input.data) return
    if (options.money === false) input.data = withoutMoneyFields(def.key, input.data) as typeof input.data
    const next: Record<string, unknown> = { ...(stage.data ?? {}) }
    for (const [key, value] of Object.entries(input.data)) {
      const field = def.fields.find((entry) => entry.key === key)
      if (!field) continue
      next[key] = typeof value === 'string' ? value.trim() : value
      const before = comparable((stage.data as Record<string, unknown> | null)?.[key])
      const after = comparable(next[key])
      if (String(before ?? '') !== String(after ?? '')) changed.push({ key, label: field.label, from: before, to: after })
    }
    stage.data = next
  }
  const markStarted = () => {
    if ((stage.data as Record<string, unknown> | null)?.__started) return
    stage.data = { ...(stage.data ?? {}), __started: { at: new Date().toISOString(), by: byName } }
  }

  switch (input.action) {
    case 'start': {
      if (stage.status !== 'open') throw new OrderError(stage.status === 'on_hold' ? `${def.label} is on hold. Resume it first.` : `${def.label} is not waiting to be started`, 409)
      if ((stage.data as Record<string, unknown> | null)?.__started) throw new OrderError(`${def.label} is already in progress`, 409)
      markStarted()
      logEvent(ctx, order, 'started', def.key, note, byName)
      break
    }
    case 'delivered': {
      if (def.key !== 'dispatch') throw new OrderError('Only Dispatch can be marked delivered')
      if (stage.status !== 'done') throw new OrderError('Complete Dispatch first, then mark it delivered', 409)
      const deliveredOn = typeof input.data?.delivered_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.data.delivered_on) ? input.data.delivered_on : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const dispatched = typeof stage.data?.dispatch_date === 'string' ? stage.data.dispatch_date : null
      if (dispatched && deliveredOn < dispatched) throw new OrderError('Delivery date is before the dispatch date')
      const steps = { ...((stage.data?.__steps as Record<string, unknown> | undefined) ?? {}), delivered: { done: true, at: new Date().toISOString(), by: byName } }
      stage.data = { ...(stage.data ?? {}), delivered_on: deliveredOn, __steps: steps }
      order.updatedAt = new Date()
      logEvent(ctx, order, 'delivered', def.key, [`Delivered on ${deliveredOn}`, note].filter(Boolean).join(' · '), byName)
      break
    }
    case 'assign': {
      const userId = input.responsibleUserId ?? null
      stage.responsibleUserId = userId
      stage.responsibleName = userId ? ((await userNames(ctx, [userId])).get(userId) ?? null) : null
      logEvent(ctx, order, 'assigned', def.key, stage.responsibleName ?? 'Nobody', byName)
      break
    }
    case 'step': {
      markStarted()
      const step = def.steps.find((entry) => entry.key === input.stepKey)
      if (!step) throw new OrderError('Unknown step')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      const done = input.done !== false
      const index = def.steps.findIndex((entry) => entry.key === step.key)
      const current = stepStates(stage.data)
      if (done && !step.optional) {
        const earlier = def.steps.slice(0, index).filter((entry) => !entry.optional && !current[entry.key]?.done)
        if (earlier.length) throw new OrderError(`Do these first: ${earlier.map((entry) => entry.label).join(', ')}`, 400, { steps: earlier.map((entry) => entry.key) })
      }
      if (!done) {
        const later = def.steps.slice(index + 1).filter((entry) => current[entry.key]?.done)
        if (later.length) throw new OrderError(`Undo the later steps first: ${later.map((entry) => entry.label).join(', ')}`, 400)
      }
      const states = { ...stepStates(stage.data), [step.key]: { done, at: done ? new Date().toISOString() : null, by: done ? byName : null } }
      stage.data = { ...(stage.data ?? {}), __steps: states }
      logEvent(ctx, order, done ? 'step_done' : 'step_undone', def.key, step.label, byName)
      break
    }
    case 'save': {
      markStarted()
      if (stage.status === 'waiting') throw new OrderError(`${def.label} has not started yet`, 409)
      if (isFinished(stage.status)) throw new OrderError(`${def.label} is finished. Reopen it to change it.`, 409)
      mergeData()
      logEvent(ctx, order, 'saved', def.key, note, byName, changed)
      break
    }
    case 'complete': {
      markStarted()
      if (stage.status === 'waiting') throw new OrderError(`${def.label} has not started yet`, 409)
      if (stage.status === 'on_hold') throw new OrderError(`${def.label} is on hold. Resume it first.`, 409)
      if (isFinished(stage.status)) throw new OrderError(`${def.label} is already finished`, 409)
      mergeData()
      const missing = missingRequired(def, stage.data ?? {})
      if (missing.length) throw new OrderError(`Fill in: ${missing.join(', ')}`, 400, { missing })
      const orderValue = priceOrder((await ctx.em.find(CcOrderLine, { orderId: order.id })).map(pricedLine), order.pricesIncludeGst).total
      const missingDocs = await missingDocuments(ctx, order.id, def.key, orderValue, overrides.get(def.key))
      if (missingDocs.length) throw new OrderError(`Upload: ${missingDocs.map((doc) => doc.label).join(', ')}`, 400, { documents: missingDocs.map((doc) => doc.key) })
      const openSteps = missingSteps(def, stage.data)
      if (openSteps.length) throw new OrderError(`Tick these steps first: ${openSteps.join(', ')}`, 400, { steps: openSteps })
      if (def.key === 'qc') await qcGate(ctx, order)
      if (def.key === 'dispatch') {
        const orderLines = await ctx.em.find(CcOrderLine, { orderId: order.id })
        const totals = priceOrder(orderLines.map(pricedLine), order.pricesIncludeGst)
        const paid = received(await paymentsFor(ctx, [order.id]))
        const due = Math.round((totals.total - paid) * 100) / 100
        const override = String(stage.data?.dispatch_override ?? '').trim()
        if (due > 0.5 && !override) {
          throw new OrderError(
            options.money === false
              ? 'Payment is not complete for this order. Ask Accounts to record the payment, or write a reason under "Despatch before full payment".'
              : `₹${due.toLocaleString('en-IN')} is still due on this order. Record the payment in Accounts, or write a reason under "Despatch before full payment".`,
            400,
            options.money === false ? {} : { due },
          )
        }
        if (due > 0.5) logEvent(ctx, order, 'payment_override', def.key, `Despatched with ₹${due.toLocaleString('en-IN')} due: ${override}`, byName)
        await saleOut(ctx, order, byName)
      }
      stage.status = 'done'
      stage.completedAt = new Date()
      stage.completedByName = byName
      stage.holdReason = null
      stage.holdParty = null
      const took = stage.openedAt ? (stage.completedAt.getTime() - stage.openedAt.getTime()) / 86_400_000 : null
      const allowed = applyDayLimit(def.key, overrides.get(def.key))
      const timing = took === null ? null : `Took ${took < 1 ? `${Math.max(1, Math.round(took * 24))} h` : `${Math.round(took * 10) / 10} days`}${allowed ? ` of ${allowed} allowed${took > allowed ? ' (late)' : ''}` : ''}`
      logEvent(ctx, order, 'completed', def.key, [timing, note].filter(Boolean).join(' · ') || null, byName, changed)
      if (def.key === 'advance' && (await recordAdvanceFromStage(ctx, order, stage.data ?? {}, byName))) {
        logEvent(ctx, order, 'payment', def.key, `Advance ₹${Number(stage.data?.advance_amount).toLocaleString('en-IN')} recorded in Accounts`, byName)
      }
      await afterOpened(ctx, order, openReadyStages(stages), stages)
      break
    }
    case 'skip': {
      if (!def.canSkip) throw new OrderError(`${def.label} cannot be skipped`)
      if (stage.status !== 'open') throw new OrderError(`${def.label} is not open`, 409)
      stage.status = 'skipped'
      stage.completedAt = new Date()
      stage.completedByName = byName
      logEvent(ctx, order, 'skipped', def.key, note, byName)
      await afterOpened(ctx, order, openReadyStages(stages), stages)
      break
    }
    case 'hold': {
      if (stage.status !== 'open') throw new OrderError(`Only an open stage can be put on hold`, 409)
      if (!note) throw new OrderError('Write why it is on hold')
      stage.status = 'on_hold'
      stage.holdReason = note
      stage.holdParty = input.holdParty?.trim() || null
      mergeData()
      stage.data = { ...(stage.data ?? {}), __follow_up: input.followUpOn ?? null }
      logEvent(ctx, order, 'held', def.key, [stage.holdParty, note, input.followUpOn ? `follow up ${input.followUpOn}` : null].filter(Boolean).join(' · '), byName, changed)
      break
    }
    case 'resume': {
      if (stage.status !== 'on_hold') throw new OrderError(`${def.label} is not on hold`, 409)
      stage.status = 'open'
      stage.holdReason = null
      stage.holdParty = null
      stage.data = { ...(stage.data ?? {}), __follow_up: null }
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
      if (def.key === 'order') throw new OrderError('The order itself cannot be reopened; edit the order instead', 409)
      if (def.key === 'dispatch') {
        const billing = (stages.find((entry) => entry.stageKey === 'invoice')?.data ?? {}) as Record<string, unknown>
        if (typeof billing.irn === 'string' && billing.irn.trim()) throw new OrderError('The invoice is reported to GST (IRN given). Raise a credit note or book a sales return instead of reversing the despatch.', 409)
        if (stage.data && Array.isArray((stage.data as Record<string, unknown>).__returns) && ((stage.data as Record<string, unknown>).__returns as unknown[]).length) throw new OrderError('Goods from this despatch have already come back as a sales return; it cannot be reversed.', 409)
      }
      const info = reopenInfo(order, stages, def.key, overrides)
      const block = reopenBlock(info)
      if (block && !options.reopenAnyTime) {
        throw new OrderError(`${block} Only a manager with the "Reopen finished stages after the time limit" right can reopen ${def.label} now.`, 403, { reopen: info })
      }
      stage.status = 'open'
      stage.completedAt = null
      stage.completedByName = null
      if (info.stockMoved) {
        await reverseSaleOut(ctx, order, byName)
        stage.data = { ...(stage.data ?? {}), __stock_posted: true }
      }
      for (const entry of stages) {
        if (later.includes(entry.stageKey) && (entry.status === 'open' || entry.status === 'on_hold')) {
          entry.status = 'waiting'
          entry.openedAt = null
          reverted.push(entry.stageKey)
        }
      }
      logEvent(ctx, order, 'reverted', def.key, block ? `${note} · Reopened by a manager after the limit (${block})` : note, byName)
      break
    }
  }
  order.status = orderStatusFromStages(order, stages)
  order.updatedAt = new Date()
  return reverted
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
  reopen: ReopenInfo
}

export function stageViews(stages: CcOrderStage[], overrides?: StageOverrides, order?: { status: string }): StageView[] {
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage]))
  const now = Date.now()
  return STAGES.map((base) => {
    const def = overrides ? applyStageOverride(base, overrides.get(base.key)) : (stageDef(base.key) ?? base)
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
      reopen: order ? reopenInfo(order, stages, def.key, overrides) : { until: null, stockMoved: false, nextStarted: [], orderClosed: false },
    }
  })
}

export async function serializeOrder(ctx: OrderContext, order: CcOrder) {
  const [lines, stages, events] = await Promise.all([
    ctx.em.find(CcOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } }),
    ctx.em.find(CcOrderStage, { orderId: order.id }),
    ctx.em.find(CcOrderEvent, { orderId: order.id }, { orderBy: { createdAt: 'desc' }, limit: 1000 }),
  ])
  const productIds = lines.map((line) => line.productId)
  const [customers, products, payments, docCounts] = await Promise.all([
    loadCustomers(ctx, [order.customerId]),
    loadProducts(ctx, productIds),
    paymentsFor(ctx, [order.id]),
    documentCounts(ctx, order.id),
  ])
  const orderTotal = priceOrder(lines.map(pricedLine), order.pricesIncludeGst).total
  const overrides = await loadStageOverrides(ctx)
  const views = stageViews(stages, overrides, order)
  const money = await canSeeMoney(ctx)
  const view = {
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
    market: order.market ?? 'domestic',
    incoterm: order.incoterm ?? null,
    portOfLoading: order.portOfLoading ?? null,
    country: order.country ?? null,
    currency: order.currency ?? null,
    paymentRemarks: order.paymentRemarks ?? null,
    productRemarks: order.productRemarks ?? null,
    billingRemarks: order.billingRemarks ?? null,
    packingRemarks: order.packingRemarks ?? null,
    status: order.status,
    headline: orderHeadline(order.status, order.revisedAt, stages.find((stage) => stage.stageKey === 'dispatch')?.data),
    priority: order.priority,
    billingAddress: order.billingAddress ?? null,
    shippingAddress: order.shippingAddress ?? null,
    revisedAt: order.revisedAt ? order.revisedAt.toISOString() : null,
    revisedByName: order.revisedByName ?? null,
    revisionNote: order.revisionNote ?? null,
    onHold: Boolean(order.heldAt) || views.some((stage) => stage.status === 'on_hold'),
    revision: order.revision ?? 1,
    held: order.heldAt ? { at: order.heldAt.toISOString(), reason: order.holdReason ?? null, by: order.heldByName ?? null } : null,
    createdByName: order.createdByName ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    linesLocked: views.some((stage) => stage.key === 'allocation' && isFinished(stage.status)),
    lines: lines.map((line) => ({
      id: line.id,
      position: line.position,
      productId: line.productId,
      product: products.get(line.productId) ?? null,
      brandName: line.brandName ?? null,
      packSize: line.packSize ?? null,
      mrp: line.mrp == null ? null : Number(line.mrp),
      quantity: Number(line.quantity),
      rate: line.rate == null ? null : Number(line.rate),
      gstPercent: Number(line.gstPercent ?? 18),
      discountPercent: Number(line.discountPercent ?? 0),
      price: priceLine(pricedLine(line), order.pricesIncludeGst),
      batchNo: line.batchNo ?? null,
      sampleNeeded: line.sampleNeeded,
      rdNumber: line.rdNumber ?? null,
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
    documents: Object.fromEntries(views.map((stage) => [stage.key, documentStatus(order.id, stage.key, docCounts, orderTotal, overrides.get(stage.key))])),
    events: events.map((event) => ({
      id: event.id,
      stageKey: event.stageKey ?? null,
      action: event.action,
      note: event.note ?? null,
      byName: event.byName ?? null,
      changes: event.changes ?? [],
      at: event.createdAt.toISOString(),
    })),
  }
  const access = await resolveOrderAccess(ctx)
  const priced = money
    ? { ...view, canSeeMoney: true }
    : {
        ...view,
        canSeeMoney: false,
        lines: view.lines.map((line) => ({ ...line, rate: null, discountPercent: null, price: null })),
        totals: null,
        payments: null,
        stages: view.stages.map((stage) => ({ ...stage, data: withoutMoneyFields(stage.key, stage.data) })),
        events: view.events.map((event) => ({ ...event, note: isMoneyEvent(event.action) ? null : event.note, changes: event.changes.filter((change) => !event.stageKey || !isMoneyStageField(event.stageKey, change.key)) })),
      }
  const accessView = { full: access.full, stages: Array.from(access.stages) }
  if (access.full) return { ...priced, access: accessView, stages: priced.stages.map((stage) => ({ ...stage, locked: false })) }
  const contact = access.accounts || access.dispatch
  const customer = priced.customer
  return {
    ...priced,
    access: accessView,
    customer: customer ? (contact ? customer : { ...customer, gstin: null, phone: null, email: null, paymentTerms: null, paymentRemarks: null }) : null,
    paymentTerms: access.accounts ? priced.paymentTerms : null,
    paymentRemarks: access.accounts ? priced.paymentRemarks : null,
    billingRemarks: access.accounts ? priced.billingRemarks : null,
    billingAddress: access.accounts ? priced.billingAddress : null,
    shippingAddress: contact ? priced.shippingAddress : null,
    stages: trimStages(access, priced.stages, overrides),
    events: trimEvents(access, priced.events),
  }
}
