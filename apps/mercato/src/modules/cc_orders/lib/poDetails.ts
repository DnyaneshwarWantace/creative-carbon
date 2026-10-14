import { CcOrder, CcOrderLine, CcOrderPo } from '../data/entities'
import type { z } from 'zod'
import type { poDetailsSchema, poLineSchema, poWriteSchema } from '../data/validators'
import { logEvent } from './engine'
import { EMPTY_PO_DETAILS, acknowledgementDue, earliestDelivery, nextAmendmentNo, openDocuments, type PoAmendment, type PoDetails, type PoDocumentCheck, type PoLineDetails } from './poRules'
import { OrderError, loadProducts, type OrderContext } from './server'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

export type PoWriteInput = z.infer<typeof poWriteSchema>
type DetailsInput = z.infer<typeof poDetailsSchema>
type LineInput = z.infer<typeof poLineSchema>

const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

export async function findPoRow(ctx: Scope, orderId: string): Promise<CcOrderPo | null> {
  return ctx.em.findOne(CcOrderPo, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId })
}

export function normaliseDetails(input: DetailsInput | Partial<PoDetails> | null | undefined): PoDetails {
  const source = (input ?? {}) as Partial<Record<keyof PoDetails, string | null | undefined>>
  return Object.fromEntries((Object.keys(EMPTY_PO_DETAILS) as Array<keyof PoDetails>).map((key) => [key, clean(source[key])])) as PoDetails
}

function normaliseLine(input: LineInput | Partial<PoLineDetails> | undefined): PoLineDetails {
  return { itemCode: clean(input?.itemCode), description: clean(input?.description), uom: clean(input?.uom), deliveryDate: clean(input?.deliveryDate) }
}

export async function poView(ctx: OrderContext, order: CcOrder, today: string) {
  const [row, lines] = await Promise.all([findPoRow(ctx, order.id), ctx.em.find(CcOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } })])
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const stored = row?.lines ?? {}
  const lineViews = lines.map((line) => ({
    lineId: line.id,
    position: line.position,
    title: products.get(line.productId)?.title ?? '—',
    quantity: Number(line.quantity),
    ...normaliseLine(stored[line.id]),
  }))
  const details = normaliseDetails(row?.details)
  const documents: PoDocumentCheck[] = row?.documents ?? []
  const closed = order.status === 'completed' || order.status === 'cancelled'
  const { earliest, lateCount } = earliestDelivery(lineViews, closed, today)
  const poDate = details.poDate ?? order.orderDate
  return {
    orderId: order.id,
    customerPoRef: order.customerPoRef ?? null,
    details,
    lines: lineViews,
    documents,
    openDocuments: openDocuments(documents),
    amendments: (row?.amendments ?? []) as PoAmendment[],
    acknowledgedAt: row?.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
    acknowledgedByName: row?.acknowledgedByName ?? null,
    acknowledgement: order.customerPoRef ? acknowledgementDue(poDate, row?.acknowledgedAt ? row.acknowledgedAt.toISOString() : null, today) : { due: null, overdue: false, daysLeft: null },
    earliestDelivery: earliest,
    lateLines: lateCount,
    updatedAt: (row?.updatedAt ?? order.updatedAt).toISOString(),
    exists: Boolean(row),
  }
}

export async function savePo(ctx: OrderContext, order: CcOrder, input: PoWriteInput, byName: string | null): Promise<CcOrderPo> {
  const lineIds = new Set((await ctx.em.find(CcOrderLine, { orderId: order.id })).map((line) => line.id))
  const lines: Record<string, Partial<PoLineDetails>> = {}
  for (const [lineId, value] of Object.entries(input.lines)) {
    if (!lineIds.has(lineId)) throw new OrderError('A line does not belong to this order', 400)
    const normal = normaliseLine(value)
    if (Object.values(normal).some(Boolean)) lines[lineId] = normal
  }
  const row = (await findPoRow(ctx, order.id)) ?? ctx.em.create(CcOrderPo, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId: order.id })
  const before = normaliseDetails(row.details)
  const details = normaliseDetails(input.details)
  row.details = details
  row.lines = lines
  row.documents = input.documents
  row.updatedByName = byName
  row.updatedAt = new Date()
  ctx.em.persist(row)
  const changed = (Object.keys(details) as Array<keyof PoDetails>).filter((key) => details[key] !== before[key])
  if (changed.length) logEvent(ctx, order, 'po_details', null, `Customer PO details updated (${changed.length} field${changed.length === 1 ? '' : 's'})`, byName)
  await ctx.em.flush()
  return row
}

export async function addAmendment(ctx: OrderContext, order: CcOrder, date: string | null | undefined, note: string | null | undefined, byName: string | null): Promise<CcOrderPo> {
  const row = (await findPoRow(ctx, order.id)) ?? ctx.em.create(CcOrderPo, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId: order.id })
  const amendments = [...((row.amendments ?? []) as PoAmendment[])]
  const no = nextAmendmentNo(amendments)
  amendments.push({ no, date: clean(date), note: clean(note), byName, at: new Date().toISOString() })
  row.amendments = amendments
  row.details = { ...normaliseDetails(row.details), amendmentNo: no }
  row.updatedByName = byName
  row.updatedAt = new Date()
  ctx.em.persist(row)
  logEvent(ctx, order, 'po_amendment', null, `Customer PO amendment ${no}${note ? `: ${note}` : ''}`, byName)
  await ctx.em.flush()
  return row
}

export async function acknowledgePo(ctx: OrderContext, order: CcOrder, byName: string | null): Promise<CcOrderPo> {
  const row = (await findPoRow(ctx, order.id)) ?? ctx.em.create(CcOrderPo, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId: order.id })
  row.acknowledgedAt = new Date()
  row.acknowledgedByName = byName
  row.updatedByName = byName
  row.updatedAt = new Date()
  ctx.em.persist(row)
  logEvent(ctx, order, 'po_acknowledged', null, 'Customer PO acknowledged', byName)
  await ctx.em.flush()
  return row
}
