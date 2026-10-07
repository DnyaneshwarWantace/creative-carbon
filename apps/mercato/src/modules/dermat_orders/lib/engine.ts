import { canReadStage, resolveOrderAccess, trimEvents, trimStages } from './visibility'
import { RdRequest } from '../../dermat_rnd/data/entities'
import { DermatOrder, DermatOrderEvent, DermatOrderLine, DermatOrderStage, type FieldChange } from '../data/entities'
import type { StageActionInput } from '../data/validators'
import { activeOptions } from '../../dermat_lists/lib/service'
import { orderHeadline, QA_ARTWORK_CHECKS, STAGES, STOCK_STAGES, applyReopenHours, applyStageOverride, isFinished, missingRequired, missingSteps, reopenBlock, stageDef, stageReopenHours, stepStates, type ReopenInfo } from './stages'
import { effectiveStageDef, loadStageOverrides, type StageOverrides } from './stageSettings'
import { blockingChecks, checksForOrder, closeFailedChecks, ensureChecksForStage, retireStageChecks, type StageQcSummary } from '../../dermat_quality/lib/service'
import { requestsForOrder, storeBlocking } from '../../dermat_store/lib/service'
import { reservationsForOrder } from '../../dermat_planning/lib/service'
import { USE_EXISTING_BULK, existingBulkProblem, packItems } from './productionStock'
import { paymentView, paymentsFor, received, recordAdvanceFromStage } from '../../dermat_accounts/lib/service'
import { priceLine, priceOrder } from './pricing'
import { canSeeMoney, isMoneyEvent, isMoneyStageField, withoutMoneyFields } from './money'
import { documentCounts, documentStatus, missingDocuments } from './stageDocuments'

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

function comparable(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  const text = String(value).trim()
  return text === '' ? null : text
}

export function logEvent(ctx: OrderContext, order: DermatOrder, action: string, stageKey: string | null, note: string | null, byName: string | null, changes: FieldChange[] = []) {
  ctx.em.persist(
    ctx.em.create(DermatOrderEvent, {
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

async function assertSubStageOrder(ctx: OrderContext, orderId: string, stageKey: string, stepKey: string, data: Record<string, unknown>) {
  const needsMaterial = (stageKey === 'manufacturing' && stepKey === 'manufactured' && data.bulk_source !== USE_EXISTING_BULK) || (stageKey === 'filling' && stepKey === 'filled')
  if (needsMaterial) {
    const block = await storeBlocking(ctx, orderId, stageKey)
    if (block) throw new OrderError(`Stage 1 first: ${block}`, 400, { store: true })
  }
  if (stageKey === 'packing' && stepKey === 'packed') {
    if (!stepStates(data).sample?.done) throw new OrderError('Stage 1 first: make the sample of the finished good', 400)
    const qc = await blockingChecks(ctx, orderId, 'packing')
    if (qc.length) throw new OrderError(`Stage 2 first: QC has not passed the finished good yet (${qc.map((check) => check.code).join(', ')})`, 400, { qc: qc.map((check) => check.id) })
  }
}

async function linkSampleApproval(ctx: OrderContext, order: DermatOrder, data: Record<string, unknown>, byName: string | null) {
  const rdNumber = typeof data.rd_number === 'string' ? data.rd_number.trim() : ''
  if (rdNumber) {
    const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
    for (const line of lines) if (!line.rdNumber) line.rdNumber = rdNumber
  }
  const requests = await ctx.em.find(RdRequest, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId: order.id, deletedAt: null, status: { $nin: ['approved', 'dropped'] } })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  for (const request of requests) {
    const rounds = [...(request.rounds ?? [])]
    const current = rounds[rounds.length - 1]
    if (current && !current.result) {
      current.result = 'approved'
      current.feedbackOn = today
    }
    request.rounds = rounds
    request.status = 'approved'
    request.history = [...(request.history ?? []), { action: 'approved', by: byName, at: new Date().toISOString(), note: `Client approved the sample on order ${order.orderNo}` }]
    request.updatedAt = new Date()
  }
}

export type BomUsed = { id: string; version: number; orderSpecific: boolean }
export type BomsInUse = { at: string; by: string | null; pack: Record<string, BomUsed>; formula: Record<string, BomUsed> }

export async function bomsInUse(ctx: OrderContext, orderId: string, byName: string | null): Promise<BomsInUse> {
  const lines = await ctx.em.find(DermatOrderLine, { orderId })
  const productIds = lines.map((line) => line.productId)
  const pack = await approvedPackBoms(ctx, productIds, orderId)
  const bulkIds = (await bulkForProducts(ctx, productIds)).filter((id) => !productIds.includes(id))
  const formula = await approvedPackBoms(ctx, bulkIds, orderId)
  const view = (map: Map<string, { id: string; version: number; orderId: string | null }>) =>
    Object.fromEntries(Array.from(map.entries()).map(([productId, bom]) => [productId, { id: bom.id, version: bom.version, orderSpecific: Boolean(bom.orderId) }]))
  return { at: new Date().toISOString(), by: byName, pack: view(pack), formula: view(formula) }
}

export function reopenInfo(order: { status: string }, stages: DermatOrderStage[], stageKey: string, overrides?: StageOverrides): ReopenInfo {
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

export async function applyStageAction(ctx: OrderContext, order: DermatOrder, input: StageActionInput, options: { reopenAnyTime?: boolean; money?: boolean } = {}): Promise<string[]> {
  const reverted: string[] = []
  const overrides = await loadStageOverrides(ctx)
  const def = effectiveStageDef(input.stageKey, overrides)
  if (!def) throw new OrderError('Unknown stage')
  if (order.status === 'cancelled') throw new OrderError('This order is cancelled', 409)
  const stages = await ctx.em.find(DermatOrderStage, { orderId: order.id })
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
      if (done && def.key === 'artwork' && step.key === 'qa_final') {
        const ticked = ((stage.data?.__qa_art as Record<string, { done?: boolean }> | undefined) ?? {})
        const open = QA_ARTWORK_CHECKS.filter((check) => !ticked[check.key]?.done)
        if (open.length) throw new OrderError(`QA artwork checklist first: ${open.map((check) => check.label).join('; ')}`, 400)
      }
      if (done) await assertSubStageOrder(ctx, order.id, def.key, step.key, stage.data ?? {})
      const states = { ...stepStates(stage.data), [step.key]: { done, at: done ? new Date().toISOString() : null, by: done ? byName : null } }
      stage.data = { ...(stage.data ?? {}), __steps: states }
      logEvent(ctx, order, done ? 'step_done' : 'step_undone', def.key, step.label, byName)
      break
    }
    case 'pm_status': {
      markStarted()
      if (def.key !== 'artwork') throw new OrderError('Packing item status belongs to Artwork & packaging')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      if (!input.productId || !input.pmStatus || !(await activeOptions(ctx, 'designer_statuses')).includes(input.pmStatus)) throw new OrderError('Pick a packing item and a status')
      const item = (await packItems(ctx, order.id)).find((entry) => entry.productId === input.productId)
      if (!item) throw new OrderError('That packing item is not on this order', 404)
      const current = (stage.data?.__pm as Record<string, unknown> | undefined) ?? {}
      stage.data = { ...(stage.data ?? {}), __pm: { ...current, [item.productId]: { status: input.pmStatus, note: note ?? null, at: new Date().toISOString(), by: byName } } }
      logEvent(ctx, order, 'pm_status', def.key, `${item.title}: ${input.pmStatus}${note ? ` (${note})` : ''}`, byName)
      break
    }
    case 'checklist': {
      if (def.key !== 'artwork') throw new OrderError('The QA artwork checklist belongs to Artwork & packaging')
      if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(`${def.label} is not in progress`, 409)
      const check = QA_ARTWORK_CHECKS.find((entry) => entry.key === input.stepKey)
      if (!check) throw new OrderError('Unknown checklist item')
      if (stepStates(stage.data).qa_final?.done) throw new OrderError('QA already finalised the artwork. Untick it first.', 409)
      markStarted()
      const done = input.done !== false
      const current = (stage.data?.__qa_art as Record<string, unknown> | undefined) ?? {}
      stage.data = { ...(stage.data ?? {}), __qa_art: { ...current, [check.key]: { done, at: done ? new Date().toISOString() : null, by: done ? byName : null, note: note ?? null } } }
      logEvent(ctx, order, done ? 'qa_check' : 'qa_uncheck', def.key, `${check.label}${note ? ` — ${note}` : ''}`, byName)
      break
    }
    case 'rework':
    case 'reject_batch': {
      const resets: Record<string, string[]> = { manufacturing: ['manufactured'], filling: ['filled'], packing: ['sample', 'packed'] }
      const reset = resets[def.key]
      if (!reset) throw new OrderError('Only manufacturing, filling and packing can be reworked')
      if (input.action === 'reject_batch' && def.key !== 'manufacturing') throw new OrderError('Only a manufacturing batch can be rejected; filling and packing are reworked')
      if (stage.status !== 'open') throw new OrderError(`${def.label} must be in progress (resume it first if on hold)`, 409)
      if (!note) throw new OrderError(input.action === 'rework' ? 'Write what failed and what will be corrected' : 'Write why the batch is rejected')
      const failed = (await blockingChecks(ctx, order.id, def.key)).filter((check) => check.status === 'failed')
      if (!failed.length) throw new OrderError('There is no failed QC check at this stage', 409)
      markStarted()
      const codes = await closeFailedChecks(ctx, { orderId: order.id, stageKey: def.key, status: input.action === 'rework' ? 'reworked' : 'rejected', note, byName })
      const data = { ...(stage.data ?? {}) } as Record<string, unknown>
      const steps = { ...stepStates(data) }
      for (const key of reset) steps[key] = { done: false, at: null, by: null }
      const rounds = Array.isArray(data.__rework) ? (data.__rework as Array<Record<string, unknown>>) : []
      const batchNo = typeof data.batch_no === 'string' || typeof data.batch_no === 'number' ? String(data.batch_no) : null
      data.__steps = steps
      data.__rework = [...rounds, { round: rounds.length + 2, type: input.action === 'rework' ? 'rework' : 'rejected', note, qc: codes, batchNo, at: new Date().toISOString(), by: byName }]
      if (input.action === 'reject_batch') data.batch_no = null
      stage.data = data
      await ctx.em.flush()
      const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
      await ensureChecksForStage(ctx, {
        orderId: order.id,
        orderNo: order.orderNo,
        stageKey: def.key,
        productIds: def.key === 'manufacturing' ? await bulkForProducts(ctx, lines.map((line) => line.productId)) : lines.map((line) => line.productId),
        byName,
      })
      logEvent(
        ctx,
        order,
        input.action === 'rework' ? 'rework' : 'batch_rejected',
        def.key,
        `${input.action === 'rework' ? 'Rework' : `Batch ${batchNo ?? ''} rejected`} after ${codes.join(', ')} failed: ${note}. New QC check created.`,
        byName,
      )
      break
    }
    case 'new_round': {
      markStarted()
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
      const orderValue = priceOrder((await ctx.em.find(DermatOrderLine, { orderId: order.id })).map(pricedLine), order.pricesIncludeGst).total
      const missingDocs = await missingDocuments(ctx, order.id, def.key, orderValue, overrides.get(def.key))
      if (missingDocs.length) throw new OrderError(`Upload: ${missingDocs.map((doc) => doc.label).join(', ')}`, 400, { documents: missingDocs.map((doc) => doc.key) })
      if (def.key === 'sampling' && stage.data?.client_feedback !== 'Approved') {
        throw new OrderError('The client has not approved the sample. Set feedback to Approved, or start another round with their changes.', 400)
      }
      if (def.key === 'qc_qa' && stage.data?.qc_result !== 'Released') {
        throw new OrderError(
          stage.data?.qc_result === 'Rework'
            ? 'QA decided Rework: send it back to the production stage to redo, then QA reviews again'
            : stage.data?.qc_result === 'Rejected'
              ? 'QA rejected the batch: it cannot be billed or dispatched. Reopen Manufacturing for a new batch.'
              : 'Choose the QA decision',
          400,
        )
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
      const openSteps = missingSteps(def, stage.data)
      if (openSteps.length) throw new OrderError(`Tick these steps first: ${openSteps.join(', ')}`, 400, { steps: openSteps })
      const qcBlocking = reusingBulk ? [] : await blockingChecks(ctx, order.id, def.key)
      if (qcBlocking.length) {
        throw new OrderError(`QC has not passed yet: ${qcBlocking.map((check) => `${check.code} (${check.status})`).join(', ')}`, 400, { qc: qcBlocking.map((check) => check.id) })
      }
      if (def.key === 'formulation') {
        const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
        const boms = await approvedPackBoms(
          ctx,
          lines.map((line) => line.productId),
          order.id,
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
          throw new OrderError(
            options.money === false
              ? 'Payment is not complete for this order. Ask Accounts to record the payment, or write a reason under "Dispatch before full payment".'
              : `₹${due.toLocaleString('en-IN')} is still due on this order. Record the payment in Accounts, or write a reason under "Dispatch before full payment".`,
            400,
            options.money === false ? {} : { due },
          )
        }
        if (due > 0.5) logEvent(ctx, order, 'payment_override', def.key, `Dispatched with ₹${due.toLocaleString('en-IN')} due: ${override}`, byName)
      }
      stage.status = 'done'
      stage.completedAt = new Date()
      stage.completedByName = byName
      stage.holdReason = null
      stage.holdParty = null
      logEvent(ctx, order, 'completed', def.key, note, byName, changed)
      if (def.key === 'sampling') await linkSampleApproval(ctx, order, stage.data ?? {}, byName)
      if (def.key === 'manufacturing') stage.data = { ...(stage.data ?? {}), __bom_used: await bomsInUse(ctx, order.id, byName) }
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
      const info = reopenInfo(order, stages, def.key, overrides)
      const block = reopenBlock(info)
      if (block && !options.reopenAnyTime) {
        throw new OrderError(`${block} Only a manager with the "Reopen finished stages after the time limit" right can reopen ${def.label} now.`, 403, { reopen: info })
      }
      stage.status = 'open'
      stage.completedAt = null
      stage.completedByName = null
      if (info.stockMoved) stage.data = { ...(stage.data ?? {}), __stock_posted: true }
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

export function stageViews(stages: DermatOrderStage[], overrides?: StageOverrides, order?: { status: string }): StageView[] {
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

export async function serializeOrder(ctx: OrderContext, order: DermatOrder) {
  const [lines, stages, events] = await Promise.all([
    ctx.em.find(DermatOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } }),
    ctx.em.find(DermatOrderStage, { orderId: order.id }),
    ctx.em.find(DermatOrderEvent, { orderId: order.id }, { orderBy: { createdAt: 'desc' }, limit: 1000 }),
  ])
  const productIds = lines.map((line) => line.productId)
  const [customers, products, boms, qc, store, reservations, payments, docCounts] = await Promise.all([
    loadCustomers(ctx, [order.customerId]),
    loadProducts(ctx, productIds),
    approvedPackBoms(ctx, productIds, order.id),
    checksForOrder(ctx, order.id),
    requestsForOrder(ctx, order.id),
    reservationsForOrder(ctx, order.id),
    paymentsFor(ctx, [order.id]),
    documentCounts(ctx, order.id),
  ])
  const orderTotal = priceOrder(lines.map(pricedLine), order.pricesIncludeGst).total
  const qcOnly = Object.values(qc).flat().map((check) => check.productId).filter((id) => !products.has(id))
  if (qcOnly.length) for (const [id, product] of await loadProducts(ctx, qcOnly)) products.set(id, product)
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
    qc: Object.fromEntries(Object.entries(priced.qc).filter(([key]) => canReadStage(access, key))),
  }
}
