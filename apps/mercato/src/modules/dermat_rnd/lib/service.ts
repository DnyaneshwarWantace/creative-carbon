import { currentUserName, loadCustomers, type OrderContext } from '../../dermat_orders/lib/server'
import { financialYear } from '../../dermat_orders/lib/stages'
import { DermatOrder, DermatOrderStage } from '../../dermat_orders/data/entities'
import { RdRequest, type RdRound } from '../data/entities'
import type { RdAction, RdInput } from '../data/validators'

export class RdError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function stamp(request: RdRequest, action: string, by: string | null, note: string | null) {
  request.history = [...(request.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

async function nextRdNumber(ctx: OrderContext): Promise<string> {
  const prefix = `DER/RD/${financialYear(new Date())}/`
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(code from length(?) + 1), '')::int) as max from dermat_rnd_requests where tenant_id = ? and organization_id = ? and code like ?`,
    [prefix, ctx.tenantId, ctx.organizationId, `${prefix}%`],
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`
}

export async function findRequest(ctx: OrderContext, id: string): Promise<RdRequest> {
  const request = await ctx.em.findOne(RdRequest, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!request) throw new RdError('R&D request not found', 404)
  return request
}

async function applyInput(ctx: OrderContext, request: RdRequest, input: RdInput) {
  request.kind = input.kind
  if (input.kind === 'client' && !input.customerId && !input.orderId) throw new RdError('Pick the client, or mark it as a new product (NPD)')
  let customerId = input.customerId ?? null
  if (input.orderId) {
    const order = await ctx.em.findOne(DermatOrder, { id: input.orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!order) throw new RdError('Order not found', 404)
    request.orderId = order.id
    request.orderNo = order.orderNo
    customerId = customerId ?? order.customerId
  } else {
    request.orderId = null
    request.orderNo = null
  }
  request.customerId = input.kind === 'npd' && !input.orderId ? null : customerId
  request.customerName = request.customerId ? (await loadCustomers(ctx, [request.customerId])).get(request.customerId)?.name ?? null : null
  request.productName = input.productName.trim()
  request.brand = clean(input.brand)
  request.productType = clean(input.productType)
  request.ingredients = clean(input.ingredients)
  request.texture = clean(input.texture)
  request.fragrance = clean(input.fragrance)
  request.colour = clean(input.colour)
  request.packSize = clean(input.packSize)
  request.notes = clean(input.notes)
  request.dueDate = input.dueDate ?? null
  request.assignedName = clean(input.assignedName)
}

async function linkToOrder(ctx: OrderContext, request: RdRequest) {
  if (!request.orderId) return
  const stage = await ctx.em.findOne(DermatOrderStage, { orderId: request.orderId, stageKey: 'sampling' })
  if (!stage || stage.data?.rd_number) return
  stage.data = { ...(stage.data ?? {}), rd_number: request.code, sample_name: stage.data?.sample_name ?? request.productName }
}

export async function createRequest(ctx: OrderContext, input: RdInput): Promise<RdRequest> {
  const byName = await currentUserName(ctx)
  const request = ctx.em.create(RdRequest, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, code: await nextRdNumber(ctx), productName: input.productName.trim(), requestedByName: byName, rounds: [] })
  await applyInput(ctx, request, input)
  stamp(request, 'requested', byName, null)
  ctx.em.persist(request)
  await linkToOrder(ctx, request)
  await ctx.em.flush()
  return request
}

export async function updateRequest(ctx: OrderContext, request: RdRequest, input: RdInput) {
  if (request.status === 'dropped') throw new RdError('This request is closed. Reopen it first.', 409)
  await applyInput(ctx, request, input)
  stamp(request, 'edited', await currentUserName(ctx), null)
  request.updatedAt = new Date()
  await linkToOrder(ctx, request)
  await ctx.em.flush()
}

export async function actOnRequest(ctx: OrderContext, request: RdRequest, input: RdAction) {
  const byName = await currentUserName(ctx)
  const rounds: RdRound[] = [...(request.rounds ?? [])]
  const current = rounds[rounds.length - 1]
  switch (input.action) {
    case 'start':
      if (request.status !== 'requested' && request.status !== 'changes') throw new RdError('Only a new request or one with client changes can be started', 409)
      request.status = 'in_progress'
      request.assignedName = request.assignedName ?? byName
      break
    case 'sample_sent':
      if (request.status !== 'in_progress' && request.status !== 'requested' && request.status !== 'changes') throw new RdError('A sample can be sent while the request is being worked on', 409)
      rounds.push({ round: rounds.length + 1, madeOn: todayIst(), sentOn: input.sentOn ?? todayIst(), sentVia: clean(input.sentVia), feedback: null, feedbackOn: null, result: null, by: byName })
      request.status = 'sample_sent'
      break
    case 'feedback':
      if (request.status !== 'sample_sent' || !current) throw new RdError('Record feedback after a sample has been sent', 409)
      if (!input.result) throw new RdError('Did the client approve or ask for changes?')
      if (input.result === 'changes' && !clean(input.feedback)) throw new RdError('Write what the client wants changed')
      current.result = input.result
      current.feedback = clean(input.feedback)
      current.feedbackOn = todayIst()
      request.status = input.result === 'approved' ? 'approved' : 'changes'
      break
    case 'drop':
      if (request.status === 'approved' || request.status === 'dropped') throw new RdError('This request is already closed', 409)
      if (!clean(input.note)) throw new RdError('Write why the request is dropped')
      request.status = 'dropped'
      break
    case 'reopen':
      if (request.status !== 'dropped') throw new RdError('Only a dropped request can be reopened', 409)
      request.status = 'in_progress'
      break
  }
  request.rounds = rounds
  stamp(request, input.action === 'feedback' ? `feedback_${input.result}` : input.action, byName, clean(input.feedback) ?? clean(input.note) ?? (input.action === 'sample_sent' ? `Round ${rounds.length}${input.sentVia ? ` via ${input.sentVia}` : ''}` : null))
  request.updatedAt = new Date()
  await ctx.em.flush()
}

export function requestView(request: RdRequest) {
  const rounds = request.rounds ?? []
  return {
    id: request.id,
    code: request.code,
    kind: request.kind,
    status: request.status,
    customerId: request.customerId ?? null,
    customerName: request.customerName ?? null,
    orderId: request.orderId ?? null,
    orderNo: request.orderNo ?? null,
    productName: request.productName,
    brand: request.brand ?? null,
    productType: request.productType ?? null,
    ingredients: request.ingredients ?? null,
    texture: request.texture ?? null,
    fragrance: request.fragrance ?? null,
    colour: request.colour ?? null,
    packSize: request.packSize ?? null,
    notes: request.notes ?? null,
    dueDate: request.dueDate ?? null,
    assignedName: request.assignedName ?? null,
    requestedByName: request.requestedByName ?? null,
    rounds,
    lastSentOn: rounds[rounds.length - 1]?.sentOn ?? null,
    history: request.history ?? [],
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  }
}
