import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { loadCustomFieldValues } from '@open-mercato/shared/lib/crud/custom-fields'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { SalesOrder, SalesOrderLine } from '@open-mercato/core/modules/sales/data/entities'
import { StageDefinition, StageRun } from '../data/entities'
import type { StageRunStatus, StageSubjectType } from '../data/entities'
import { consumeForLine } from './planning'
import {
  DEFAULT_STAGE_DEFINITIONS,
  POST_PRODUCTION_STAGE_CODE,
  PRODUCTION_STAGE_CODE,
} from './defaultStages'

export type WorkflowScope = { organizationId: string; tenantId: string }

export type StageAction = 'save' | 'complete' | 'skip' | 'revert'

export type StageActionInput = {
  action: StageAction
  orderId: string
  subjectType: StageSubjectType
  subjectId: string
  stageCode: string
  data?: Record<string, unknown>
  reason?: string | null
  actorName?: string | null
}

export type QcRow = {
  parameter: string
  classification: string
  specification: string
  observation: string
  remark: string
  result: 'pass' | 'fail' | ''
}

const LEGACY_ORDER_STAGES = new Set([
  'new',
  'advance_payment',
  'verified',
  'rnd_sample',
  'artwork_packaging',
  'procurement_material',
  'production',
  'qc_qa',
  'billing_payment',
  'ready_to_dispatch',
  'dispatched_completed',
])

const ORDER_STAGE_ALIASES: Record<string, string[]> = {
  new: ['new', 'draft', 'pending'],
  advance_payment: ['advance_payment', 'advance', 'awaiting_advance'],
  verified: ['verified', 'official', 'confirmed'],
  rnd_sample: ['rnd_sample', 'sample_trial', 'sample_sent', 'r_and_d', 'lab_trial', 'sampling', 'samples', 'sample'],
  artwork_packaging: ['artwork_packaging', 'artwork', 'pm_sourcing', 'artwork_approved', 'formulation_approved', 'pm_received', 'pm_source'],
  procurement_material: ['procurement_material', 'procurement', 'material'],
  production: ['production', 'in_production', 'processing', 'manufacturing', 'bulk_compounding'],
  qc_qa: ['qc_qa', 'qc', 'qa', 'qc_packing', 'quality_check', 'packaging', 'packing', 'qc_approved', 'cartoning'],
  billing_payment: ['billing_payment', 'billing', 'payment'],
  ready_to_dispatch: ['ready_to_dispatch', 'ready_dispatch', 'ready'],
  dispatched_completed: ['dispatched_completed', 'dispatched', 'fulfilled', 'delivered', 'completed', 'shipped'],
}

export function normalizeOrderStageCode(raw: string | null | undefined, knownCodes: string[]): string | null {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return null
  if (knownCodes.includes(value)) return value
  for (const [code, aliases] of Object.entries(ORDER_STAGE_ALIASES)) {
    if (knownCodes.includes(code) && aliases.includes(value)) return code
  }
  return knownCodes.find((code) => value.includes(code) || code.includes(value)) ?? null
}

type OrderContext = {
  order: SalesOrder
  lines: SalesOrderLine[]
  currentStageCode: string
  customerName: string | null
}

function scopeWhere(scope: WorkflowScope) {
  return { organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null }
}

export async function ensureDefinitions(em: EntityManager, scope: WorkflowScope): Promise<void> {
  const existing = await em.find(StageDefinition, { organizationId: scope.organizationId, tenantId: scope.tenantId })
  const existingCodes = new Set(existing.map((definition) => definition.code))
  const missing = DEFAULT_STAGE_DEFINITIONS.filter((definition) => !existingCodes.has(definition.code))
  if (!missing.length) return
  for (const definition of missing) {
    em.persist(
      em.create(StageDefinition, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        code: definition.code,
        name: definition.name,
        subjectType: definition.subjectType,
        phase: definition.phase ?? null,
        phaseLabel: definition.phaseLabel ?? null,
        unit: definition.unit ?? null,
        sequence: definition.sequence,
        department: definition.department,
        kind: definition.kind,
        fields: definition.fields,
        config: definition.config ?? {},
        isOptional: definition.isOptional ?? false,
        isAutomatic: definition.isAutomatic ?? false,
        isActive: true,
      }),
    )
  }
  await em.flush()
}

export async function listDefinitions(
  em: EntityManager,
  scope: WorkflowScope,
  options: { includeInactive?: boolean } = {},
): Promise<StageDefinition[]> {
  await ensureDefinitions(em, scope)
  const where: Record<string, unknown> = { ...scopeWhere(scope) }
  if (!options.includeInactive) where.isActive = true
  return em.find(StageDefinition, where, { orderBy: { subjectType: 'asc', sequence: 'asc' } })
}

function orderDefinitions(definitions: StageDefinition[]): StageDefinition[] {
  return definitions.filter((definition) => definition.subjectType === 'order').sort((a, b) => a.sequence - b.sequence)
}

function lineDefinitions(definitions: StageDefinition[]): StageDefinition[] {
  return definitions.filter((definition) => definition.subjectType === 'order_line').sort((a, b) => a.sequence - b.sequence)
}

function resolveCustomerName(order: SalesOrder): string | null {
  const snapshot = (order.customerSnapshot ?? {}) as Record<string, unknown>
  const customer = (snapshot.customer ?? {}) as Record<string, unknown>
  const contact = (snapshot.contact ?? {}) as Record<string, unknown>
  const displayName = customer.displayName ?? customer.name ?? customer.companyName
  if (typeof displayName === 'string' && displayName.trim()) return displayName.trim()
  const contactName = [contact.firstName, contact.lastName].filter((part) => typeof part === 'string' && part).join(' ')
  return contactName || null
}

function resolveProductCode(line: SalesOrderLine): string | null {
  const snapshot = (line.catalogSnapshot ?? {}) as Record<string, unknown>
  const product = (snapshot.product ?? {}) as Record<string, unknown>
  const variant = (snapshot.variant ?? {}) as Record<string, unknown>
  const candidates = [snapshot.sku, product.sku, variant.sku, snapshot.productCode, product.productCode]
  const found = candidates.find((value) => typeof value === 'string' && value.trim())
  return typeof found === 'string' ? found.trim() : null
}

async function productCodesById(em: EntityManager, scope: WorkflowScope, productIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!productIds.length) return result
  const placeholders = productIds.map(() => '?').join(', ')
  const rows = await em.getConnection().execute<Array<{ id: string; sku: string | null }>>(
    `select id, sku from catalog_products where id in (${placeholders}) and organization_id = ? and tenant_id = ?`,
    [...productIds, scope.organizationId, scope.tenantId],
  )
  for (const row of rows) if (row.sku) result.set(row.id, row.sku)
  return result
}

export async function loadOrderContext(
  em: EntityManager,
  scope: WorkflowScope,
  orderId: string,
  knownCodes: string[],
): Promise<OrderContext> {
  const order = await findOneWithDecryption(
    em,
    SalesOrder,
    { id: orderId, ...scopeWhere(scope) },
    {},
    scope,
  )
  if (!order) throw new CrudHttpError(404, { error: '[internal] Order not found' })
  const lines = await findWithDecryption(
    em,
    SalesOrderLine,
    { order: orderId, ...scopeWhere(scope) },
    { orderBy: { lineNumber: 'asc' } },
    scope,
  )
  const customValues = await loadCustomFieldValues({
    em,
    entityId: 'sales:sales_order',
    recordIds: [orderId],
    tenantFallbacks: [scope.tenantId],
  })
  const orderValues = customValues[orderId] ?? {}
  const rawStage = orderValues.cf_order_stage ?? orderValues.order_stage
  const currentStageCode =
    normalizeOrderStageCode(typeof rawStage === 'string' ? rawStage : null, knownCodes) ?? knownCodes[0] ?? 'new'
  return {
    order,
    lines: lines.filter((line) => (line.kind ?? 'product') === 'product'),
    currentStageCode,
    customerName: resolveCustomerName(order),
  }
}

async function latestRuns(
  em: EntityManager,
  scope: WorkflowScope,
  where: Record<string, unknown>,
): Promise<StageRun[]> {
  return em.find(StageRun, { ...scopeWhere(scope), ...where }, { orderBy: { createdAt: 'desc' } })
}

function pickLatest(runs: StageRun[], subjectId: string, stageCode: string): StageRun | null {
  return runs.find((run) => run.subjectId === subjectId && run.stageCode === stageCode) ?? null
}

function nextBatchNumber(orderNumber: string | null, lineIndex: number): string {
  const base = (orderNumber ?? 'ORD').replace(/^ORD-?/i, '')
  return `BT-${base}-${String(lineIndex + 1).padStart(2, '0')}`
}

function createRun(
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  input: {
    subjectType: StageSubjectType
    subjectId: string
    stageCode: string
    data?: Record<string, unknown>
    line?: SalesOrderLine
    batchNumber?: string | null
    productCode?: string | null
  },
): StageRun {
  const run = em.create(StageRun, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    orderId: context.order.id,
    orderNumber: context.order.orderNumber ?? null,
    customerName: context.customerName,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    stageCode: input.stageCode,
    status: 'in_progress',
    data: input.data ?? {},
    batchNumber: input.batchNumber ?? null,
    productId: input.line?.productId ?? null,
    productName: input.line?.name ?? null,
    productCode: input.productCode ?? null,
    quantity: input.line?.quantity != null ? String(input.line.quantity) : null,
    startedAt: new Date(),
  })
  em.persist(run)
  return run
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (typeof value === 'boolean') return value === false
  if (Array.isArray(value)) return value.length === 0
  return false
}

export function validateStageData(definition: StageDefinition, data: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const field of definition.fields ?? []) {
    if (field.required && isBlank(data[field.key])) problems.push(field.label)
  }
  if (definition.kind === 'qc_test') {
    const rows = Array.isArray(data.qc_rows) ? (data.qc_rows as QcRow[]) : []
    if (!rows.length) problems.push('QC parameters')
    rows.forEach((row) => {
      if (isBlank(row.observation)) problems.push(`${row.parameter}: observation`)
      if (row.result !== 'pass' && row.result !== 'fail') problems.push(`${row.parameter}: result`)
    })
    if (isBlank(data.tested_by)) problems.push('Tested by')
  }
  return problems
}

function qcFailed(definition: StageDefinition, data: Record<string, unknown>): boolean {
  if (definition.kind !== 'qc_test') return false
  const rows = Array.isArray(data.qc_rows) ? (data.qc_rows as QcRow[]) : []
  return rows.some((row) => row.result === 'fail')
}

async function writeOrderStage(
  ctx: CommandRuntimeContext,
  scope: WorkflowScope,
  context: OrderContext,
  targetStage: string,
  gate: { data?: Record<string, unknown>; revertReason?: string | null; actorName?: string | null },
): Promise<void> {
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  const data = gate.data ?? {}
  if (LEGACY_ORDER_STAGES.has(targetStage) && LEGACY_ORDER_STAGES.has(context.currentStageCode)) {
    const amount = Number(data.advance_received_amount)
    await commandBus.execute('dermat_sales_flow.orders.transition_stage', {
      input: {
        id: context.order.id,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        targetStage,
        actorName: gate.actorName ?? null,
        advanceReceivedAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
        advanceReceivedAt: typeof data.advance_received_at === 'string' ? data.advance_received_at : null,
        advancePaymentRef: typeof data.payment_ref === 'string' ? data.payment_ref : null,
        verifyNote: typeof data.verify_note === 'string' ? data.verify_note : null,
        sampleSentNote: typeof data.sample_sent_note === 'string' ? data.sample_sent_note : null,
        revertReason: gate.revertReason ?? null,
      },
      ctx,
    })
    return
  }
  await commandBus.execute('sales.orders.update', {
    input: { id: context.order.id, customFields: { order_stage: targetStage }, metadata: { order_stage: targetStage } },
    ctx,
  })
}

async function openLineRuns(
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  lineDefs: StageDefinition[],
): Promise<void> {
  const first = lineDefs[0]
  if (!first || !context.lines.length) return
  const existing = await latestRuns(em, scope, { orderId: context.order.id, subjectType: 'order_line' })
  const codes = await productCodesById(
    em,
    scope,
    context.lines.map((line) => line.productId).filter((id): id is string => Boolean(id)),
  )
  context.lines.forEach((line, index) => {
    const alreadyStarted = existing.some((run) => run.subjectId === line.id)
    if (alreadyStarted) return
    createRun(em, scope, context, {
      subjectType: 'order_line',
      subjectId: line.id,
      stageCode: first.code,
      line,
      batchNumber: nextBatchNumber(context.order.orderNumber ?? null, index),
      productCode: resolveProductCode(line) ?? (line.productId ? codes.get(line.productId) ?? null : null),
    })
  })
}

function actorOf(ctx: CommandRuntimeContext, actorName?: string | null): string {
  return actorName || ctx.auth?.email || ctx.auth?.sub || 'User'
}

export async function performStageAction(
  ctx: CommandRuntimeContext,
  scope: WorkflowScope,
  input: StageActionInput,
): Promise<{ ok: true; stageCode: string | null }> {
  const rootEm = ctx.container.resolve<EntityManager>('em').fork()
  await ensureDefinitions(rootEm, scope)
  return rootEm.transactional(async (em) => {
    const definitions = await listDefinitions(em, scope)
    const orderDefs = orderDefinitions(definitions)
    const lineDefs = lineDefinitions(definitions)
    const context = await loadOrderContext(em, scope, input.orderId, orderDefs.map((definition) => definition.code))
    const actor = actorOf(ctx, input.actorName)
    const definition = definitions.find((candidate) => candidate.code === input.stageCode && candidate.subjectType === input.subjectType)
    if (!definition) throw new CrudHttpError(400, { error: '[internal] Unknown stage' })

    const runs = await latestRuns(em, scope, { orderId: context.order.id })

    if (input.subjectType === 'order') {
      return handleOrderAction(ctx, em, scope, context, definition, orderDefs, lineDefs, runs, input, actor)
    }
    return handleLineAction(ctx, em, scope, context, definition, orderDefs, lineDefs, runs, input, actor)
  })
}

async function handleOrderAction(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  definition: StageDefinition,
  orderDefs: StageDefinition[],
  lineDefs: StageDefinition[],
  runs: StageRun[],
  input: StageActionInput,
  actor: string,
): Promise<{ ok: true; stageCode: string | null }> {
  if (definition.code !== context.currentStageCode) {
    throw new CrudHttpError(409, { error: '[internal] This stage is not the order\'s current stage', code: 'stage_not_current' })
  }
  const index = orderDefs.findIndex((candidate) => candidate.code === definition.code)
  let run = pickLatest(runs, context.order.id, definition.code)
  if (!run || run.status !== 'in_progress') {
    run = createRun(em, scope, context, {
      subjectType: 'order',
      subjectId: context.order.id,
      stageCode: definition.code,
      data: run?.data ?? {},
    })
  }
  const mergedData = { ...(run.data ?? {}), ...(input.data ?? {}) }
  run.data = mergedData

  if (input.action === 'save') {
    await em.flush()
    return { ok: true, stageCode: definition.code }
  }

  if (input.action === 'revert') {
    const reason = input.reason?.trim()
    if (!reason) throw new CrudHttpError(422, { error: '[internal] A reason is required to revert', code: 'revert_reason_required' })
    const previous = [...orderDefs.slice(0, Math.max(index, 0))].reverse().find((candidate) => {
      const previousRun = pickLatest(runs, context.order.id, candidate.code)
      return previousRun?.status !== 'skipped'
    })
    if (!previous) throw new CrudHttpError(422, { error: '[internal] This is the first stage', code: 'no_previous_stage' })
    run.status = 'reverted'
    run.revertReason = reason
    run.revertedAt = new Date()
    run.revertedBy = actor
    const previousRun = pickLatest(runs, context.order.id, previous.code)
    if (previous.code === PRODUCTION_STAGE_CODE) {
      await reopenLastLineStages(em, scope, context, lineDefs, runs, reason, actor)
      createRun(em, scope, context, { subjectType: 'order', subjectId: context.order.id, stageCode: previous.code })
    } else {
      createRun(em, scope, context, {
        subjectType: 'order',
        subjectId: context.order.id,
        stageCode: previous.code,
        data: previousRun?.data ?? {},
      })
    }
    await writeOrderStage(ctx, scope, context, previous.code, { revertReason: reason, actorName: actor })
    await em.flush()
    return { ok: true, stageCode: previous.code }
  }

  if (definition.isAutomatic) {
    throw new CrudHttpError(422, {
      error: '[internal] This stage completes automatically when every product finishes packing',
      code: 'stage_automatic',
    })
  }

  if (input.action === 'skip') {
    if (!definition.isOptional) throw new CrudHttpError(422, { error: '[internal] This stage cannot be skipped', code: 'stage_not_optional' })
    run.status = 'skipped'
    run.completedAt = new Date()
    run.completedBy = actor
  } else {
    const problems = validateStageData(definition, mergedData)
    if (problems.length) {
      throw new CrudHttpError(422, { error: `[internal] Fill in required fields: ${problems.join(', ')}`, code: 'required_fields', fields: problems })
    }
    run.status = 'completed'
    run.completedAt = new Date()
    run.completedBy = actor
  }

  const next = orderDefs[index + 1] ?? null
  if (next) {
    createRun(em, scope, context, { subjectType: 'order', subjectId: context.order.id, stageCode: next.code })
    if (next.code === PRODUCTION_STAGE_CODE) await openLineRuns(em, scope, context, lineDefs)
    const gateData = input.action === 'skip'
      ? { ...mergedData, sample_sent_note: mergedData.sample_sent_note || 'Stage skipped — not required for this order' }
      : mergedData
    await writeOrderStage(ctx, scope, context, next.code, { data: gateData, actorName: actor })
  }
  await em.flush()
  return { ok: true, stageCode: next?.code ?? null }
}

async function reopenLastLineStages(
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  lineDefs: StageDefinition[],
  runs: StageRun[],
  reason: string,
  actor: string,
): Promise<void> {
  const last = lineDefs[lineDefs.length - 1]
  if (!last) return
  for (const line of context.lines) {
    const lastRun = pickLatest(runs, line.id, last.code)
    if (!lastRun) continue
    lastRun.status = 'reverted'
    lastRun.revertReason = reason
    lastRun.revertedAt = new Date()
    lastRun.revertedBy = actor
    createRun(em, scope, context, {
      subjectType: 'order_line',
      subjectId: line.id,
      stageCode: last.code,
      data: lastRun.data ?? {},
      line,
      batchNumber: lastRun.batchNumber ?? null,
      productCode: lastRun.productCode ?? null,
    })
  }
}

async function handleLineAction(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  definition: StageDefinition,
  orderDefs: StageDefinition[],
  lineDefs: StageDefinition[],
  runs: StageRun[],
  input: StageActionInput,
  actor: string,
): Promise<{ ok: true; stageCode: string | null }> {
  if (context.currentStageCode !== PRODUCTION_STAGE_CODE) {
    throw new CrudHttpError(409, { error: '[internal] The order is not in production', code: 'order_not_in_production' })
  }
  const line = context.lines.find((candidate) => candidate.id === input.subjectId)
  if (!line) throw new CrudHttpError(404, { error: '[internal] Order line not found' })
  const run = runs.find((candidate) => candidate.subjectId === line.id && candidate.status === 'in_progress')
  if (!run || run.stageCode !== definition.code) {
    throw new CrudHttpError(409, { error: '[internal] This stage is not the product\'s current stage', code: 'stage_not_current' })
  }
  const mergedData = { ...(run.data ?? {}), ...(input.data ?? {}) }
  run.data = mergedData
  const index = lineDefs.findIndex((candidate) => candidate.code === definition.code)

  if (input.action === 'save') {
    await em.flush()
    return { ok: true, stageCode: definition.code }
  }

  if (input.action === 'revert') {
    const reason = input.reason?.trim()
    if (!reason) throw new CrudHttpError(422, { error: '[internal] A reason is required to revert', code: 'revert_reason_required' })
    const previous = lineDefs[index - 1]
    if (!previous) {
      throw new CrudHttpError(422, {
        error: '[internal] This is the first production stage — revert the order from Production instead',
        code: 'no_previous_stage',
      })
    }
    run.status = 'reverted'
    run.revertReason = reason
    run.revertedAt = new Date()
    run.revertedBy = actor
    const previousRun = pickLatest(runs, line.id, previous.code)
    createRun(em, scope, context, {
      subjectType: 'order_line',
      subjectId: line.id,
      stageCode: previous.code,
      data: previousRun?.data ?? {},
      line,
      batchNumber: run.batchNumber ?? null,
      productCode: run.productCode ?? null,
    })
    await em.flush()
    return { ok: true, stageCode: previous.code }
  }

  if (input.action === 'skip') {
    if (!definition.isOptional) throw new CrudHttpError(422, { error: '[internal] This stage cannot be skipped', code: 'stage_not_optional' })
    run.status = 'skipped'
  } else {
    const problems = validateStageData(definition, mergedData)
    if (problems.length) {
      throw new CrudHttpError(422, { error: `[internal] Fill in required fields: ${problems.join(', ')}`, code: 'required_fields', fields: problems })
    }
    if (qcFailed(definition, mergedData)) {
      throw new CrudHttpError(422, {
        error: '[internal] QC failed — the batch cannot move forward. Revert it for rework.',
        code: 'qc_failed',
      })
    }
    run.status = 'completed'
    const issueKind =
      definition.config?.issuesMaterial ??
      (definition.code === 'mfg_requirement' ? 'raw_material' : definition.code === 'fill_requirement' ? 'packaging_material' : null)
    if (issueKind) await consumeForLine(em, scope, context.order.id, line.id, issueKind, actor)
  }
  run.completedAt = new Date()
  run.completedBy = actor

  const next = lineDefs[index + 1] ?? null
  if (next) {
    createRun(em, scope, context, {
      subjectType: 'order_line',
      subjectId: line.id,
      stageCode: next.code,
      line,
      batchNumber: run.batchNumber ?? null,
      productCode: run.productCode ?? null,
    })
    await em.flush()
    return { ok: true, stageCode: next.code }
  }

  await em.flush()
  const allDone = await allLinesFinished(em, scope, context, lineDefs)
  if (!allDone) return { ok: true, stageCode: null }

  const productionIndex = orderDefs.findIndex((candidate) => candidate.code === PRODUCTION_STAGE_CODE)
  const afterProduction = orderDefs[productionIndex + 1]
    ?? orderDefs.find((candidate) => candidate.code === POST_PRODUCTION_STAGE_CODE)
    ?? null
  const productionRun = await em.findOne(StageRun, {
    ...scopeWhere(scope),
    orderId: context.order.id,
    subjectType: 'order',
    stageCode: PRODUCTION_STAGE_CODE,
    status: 'in_progress',
  })
  if (productionRun) {
    productionRun.status = 'completed'
    productionRun.completedAt = new Date()
    productionRun.completedBy = actor
  }
  if (afterProduction) {
    createRun(em, scope, context, { subjectType: 'order', subjectId: context.order.id, stageCode: afterProduction.code })
    await writeOrderStage(ctx, scope, context, afterProduction.code, { actorName: actor })
  }
  await em.flush()
  return { ok: true, stageCode: afterProduction?.code ?? null }
}

async function allLinesFinished(
  em: EntityManager,
  scope: WorkflowScope,
  context: OrderContext,
  lineDefs: StageDefinition[],
): Promise<boolean> {
  const last = lineDefs[lineDefs.length - 1]
  if (!last) return true
  const runs = await latestRuns(em, scope, { orderId: context.order.id, subjectType: 'order_line' })
  return context.lines.every((line) => {
    const open = runs.some((run) => run.subjectId === line.id && run.status === 'in_progress')
    const finished = runs.some((run) => run.subjectId === line.id && run.stageCode === last.code && (run.status === 'completed' || run.status === 'skipped'))
    return !open && finished
  })
}

export type FlowStageView = {
  code: string
  name: string
  department: string
  kind: string
  phase: string | null
  phaseLabel: string | null
  unit: string | null
  isOptional: boolean
  isAutomatic: boolean
  state: 'done' | 'current' | 'upcoming' | 'skipped'
  run: SerializedRun | null
  history: SerializedRun[]
}

export type SerializedRun = {
  id: string
  status: StageRunStatus
  data: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  completedBy: string | null
  revertReason: string | null
  revertedAt: string | null
  revertedBy: string | null
}

export function serializeRun(run: StageRun): SerializedRun {
  return {
    id: run.id,
    status: run.status,
    data: run.data ?? {},
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    completedBy: run.completedBy ?? null,
    revertReason: run.revertReason ?? null,
    revertedAt: run.revertedAt ? run.revertedAt.toISOString() : null,
    revertedBy: run.revertedBy ?? null,
  }
}

export function serializeDefinition(definition: StageDefinition) {
  return {
    id: definition.id,
    code: definition.code,
    name: definition.name,
    subjectType: definition.subjectType,
    phase: definition.phase ?? null,
    phaseLabel: definition.phaseLabel ?? null,
    unit: definition.unit ?? null,
    sequence: definition.sequence,
    department: definition.department,
    kind: definition.kind,
    fields: definition.fields ?? [],
    config: definition.config ?? {},
    isOptional: definition.isOptional,
    isAutomatic: definition.isAutomatic,
    isActive: definition.isActive,
    updatedAt: definition.updatedAt ? definition.updatedAt.toISOString() : null,
  }
}

function stageViews(
  defs: StageDefinition[],
  runs: StageRun[],
  subjectId: string,
  currentCode: string | null,
  finished: boolean,
): FlowStageView[] {
  const currentIndex = currentCode ? defs.findIndex((definition) => definition.code === currentCode) : -1
  return defs.map((definition, index) => {
    const history = runs
      .filter((run) => run.subjectId === subjectId && run.stageCode === definition.code)
      .map(serializeRun)
    const latest = history[0] ?? null
    let state: FlowStageView['state'] = 'upcoming'
    if (finished) state = latest?.status === 'skipped' ? 'skipped' : 'done'
    else if (index === currentIndex) state = 'current'
    else if (currentIndex >= 0 && index < currentIndex) state = latest?.status === 'skipped' ? 'skipped' : 'done'
    return {
      code: definition.code,
      name: definition.name,
      department: definition.department,
      kind: definition.kind,
      phase: definition.phase ?? null,
      phaseLabel: definition.phaseLabel ?? null,
      unit: definition.unit ?? null,
      isOptional: definition.isOptional,
      isAutomatic: definition.isAutomatic,
      state,
      run: latest,
      history,
    }
  })
}

export async function getOrderFlow(em: EntityManager, scope: WorkflowScope, orderId: string) {
  const definitions = await listDefinitions(em, scope)
  const orderDefs = orderDefinitions(definitions)
  const lineDefs = lineDefinitions(definitions)
  const context = await loadOrderContext(em, scope, orderId, orderDefs.map((definition) => definition.code))
  const runs = await latestRuns(em, scope, { orderId })
  const lastOrderDef = orderDefs[orderDefs.length - 1]
  const orderFinished = Boolean(
    lastOrderDef && runs.some((run) => run.subjectId === orderId && run.stageCode === lastOrderDef.code && run.status === 'completed'),
  )
  const knownCurrent = orderDefs.some((definition) => definition.code === context.currentStageCode)
  const lines = context.lines.map((line) => {
    const lineRuns = runs.filter((run) => run.subjectId === line.id)
    const open = lineRuns.find((run) => run.status === 'in_progress') ?? null
    const lastDef = lineDefs[lineDefs.length - 1]
    const finished = !open && lineRuns.some((run) => lastDef && run.stageCode === lastDef.code && run.status === 'completed')
    const started = lineRuns.length > 0
    const anyRun = lineRuns[0] ?? null
    return {
      lineId: line.id,
      productId: line.productId ?? null,
      productName: line.name ?? anyRun?.productName ?? null,
      productCode: anyRun?.productCode ?? resolveProductCode(line),
      quantity: line.quantity != null ? String(line.quantity) : null,
      quantityUnit: line.quantityUnit ?? null,
      batchNumber: anyRun?.batchNumber ?? null,
      started,
      finished,
      currentStageCode: open?.stageCode ?? null,
      stages: started ? stageViews(lineDefs, runs, line.id, open?.stageCode ?? null, finished) : stageViews(lineDefs, runs, line.id, null, false),
    }
  })
  return {
    order: {
      id: context.order.id,
      orderNumber: context.order.orderNumber ?? null,
      customerName: context.customerName,
      currentStageCode: knownCurrent ? context.currentStageCode : orderDefs[0]?.code ?? null,
      finished: orderFinished,
    },
    stages: stageViews(orderDefs, runs, orderId, knownCurrent ? context.currentStageCode : orderDefs[0]?.code ?? null, orderFinished),
    lines,
    definitions: definitions.map(serializeDefinition),
  }
}

export type QueueRow = {
  key: string
  orderId: string
  orderNumber: string | null
  customerName: string | null
  subjectType: StageSubjectType
  subjectId: string
  stageCode: string
  stageName: string
  department: string
  phase: string | null
  phaseLabel: string | null
  productName: string | null
  productCode: string | null
  batchNumber: string | null
  quantity: string | null
  since: string | null
  status: StageRunStatus | 'waiting'
}

export async function getQueue(
  em: EntityManager,
  scope: WorkflowScope,
  filters: { department?: string | null; phase?: string | null; stageCode?: string | null; search?: string | null },
): Promise<QueueRow[]> {
  const definitions = await listDefinitions(em, scope)
  const byCode = new Map(definitions.map((definition) => [definition.code, definition]))
  const matches = (definition: StageDefinition | undefined) => {
    if (!definition) return false
    if (filters.department && definition.department !== filters.department) return false
    if (filters.phase && definition.phase !== filters.phase) return false
    if (filters.stageCode && definition.code !== filters.stageCode) return false
    return true
  }

  const rows: QueueRow[] = []

  const lineRuns = await em.find(
    StageRun,
    { ...scopeWhere(scope), subjectType: 'order_line', status: 'in_progress' },
    { orderBy: { createdAt: 'asc' } },
  )
  for (const run of lineRuns) {
    const definition = byCode.get(run.stageCode)
    if (!matches(definition) || !definition) continue
    rows.push({
      key: run.id,
      orderId: run.orderId,
      orderNumber: run.orderNumber ?? null,
      customerName: run.customerName ?? null,
      subjectType: 'order_line',
      subjectId: run.subjectId,
      stageCode: run.stageCode,
      stageName: definition.name,
      department: definition.department,
      phase: definition.phase ?? null,
      phaseLabel: definition.phaseLabel ?? null,
      productName: run.productName ?? null,
      productCode: run.productCode ?? null,
      batchNumber: run.batchNumber ?? null,
      quantity: run.quantity ?? null,
      since: run.startedAt ? run.startedAt.toISOString() : null,
      status: run.status,
    })
  }

  const orderStageCodes = definitions
    .filter((definition) => definition.subjectType === 'order' && !definition.isAutomatic && matches(definition))
    .map((definition) => definition.code)
  if (orderStageCodes.length) {
    const allOrderCodes = definitions.filter((definition) => definition.subjectType === 'order').map((definition) => definition.code)
    const rawRows = await em.getConnection().execute<Array<{ record_id: string; value_text: string | null }>>(
      `select o.id::text as record_id, v.value_text
         from sales_orders o
         left join lateral (
           select value_text from custom_field_values
            where entity_id = 'sales:sales_order' and field_key = 'order_stage' and deleted_at is null and record_id = o.id::text
            order by created_at desc
            limit 1
         ) v on true
        where o.organization_id = ? and o.tenant_id = ? and o.deleted_at is null`,
      [scope.organizationId, scope.tenantId],
    )
    const stageRows = rawRows
      .map((row) => ({
        record_id: row.record_id,
        value_text: normalizeOrderStageCode(row.value_text, allOrderCodes) ?? allOrderCodes[0] ?? 'new',
      }))
      .filter((row) => orderStageCodes.includes(row.value_text))
    const orderIds = stageRows.map((row) => row.record_id)
    if (orderIds.length) {
      const orders = await findWithDecryption(em, SalesOrder, { id: { $in: orderIds }, ...scopeWhere(scope) }, {}, scope)
      const openRuns = await em.find(StageRun, {
        ...scopeWhere(scope),
        orderId: { $in: orderIds },
        subjectType: 'order',
        status: 'in_progress',
      })
      const stageByOrder = new Map(stageRows.map((row) => [row.record_id, row.value_text]))
      for (const order of orders) {
        const stageCode = stageByOrder.get(order.id)
        const definition = stageCode ? byCode.get(stageCode) : undefined
        if (!definition || !stageCode) continue
        const openRun = openRuns.find((run) => run.orderId === order.id && run.stageCode === stageCode)
        rows.push({
          key: `${order.id}:${stageCode}`,
          orderId: order.id,
          orderNumber: order.orderNumber ?? null,
          customerName: resolveCustomerName(order),
          subjectType: 'order',
          subjectId: order.id,
          stageCode,
          stageName: definition.name,
          department: definition.department,
          phase: null,
          phaseLabel: null,
          productName: null,
          productCode: null,
          batchNumber: null,
          quantity: null,
          since: openRun?.startedAt ? openRun.startedAt.toISOString() : (order.updatedAt ? order.updatedAt.toISOString() : null),
          status: openRun ? 'in_progress' : 'waiting',
        })
      }
    }
  }

  const term = filters.search?.trim().toLowerCase()
  const filtered = term
    ? rows.filter((row) =>
        [row.orderNumber, row.customerName, row.productName, row.productCode, row.batchNumber, row.stageName]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(term)),
      )
    : rows
  return filtered.sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''))
}
