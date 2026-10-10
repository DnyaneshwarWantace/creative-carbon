import type { OrderContext } from '../../cc_orders/lib/server'
import { hasFeatures, loadCustomers, loadProducts } from '../../cc_orders/lib/server'
import { createOrderRecord, validateInput } from '../../cc_orders/lib/orderCreate'
import { orderInputSchema } from '../../cc_orders/data/validators'
import { priceLine, priceOrder } from '../../cc_orders/lib/pricing'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { CcEnquiry, CcQuotation } from '../data/entities'
import { CcOrder } from '../../cc_orders/data/entities'
import { logEvent } from '../../cc_orders/lib/engine'
import { logCorrection, recordActivity } from '../../cc_audit/lib/activity'
import type { QuotationAction, QuotationInput } from '../data/validators'
import { markEnquiry } from './enquiries'
import { CrmError, entry, todayIst } from './server'

type StoredLine = QuotationInput['lines'][number]
type StoredData = Omit<QuotationInput, 'orderDate' | 'customerId' | 'validUntil' | 'enquiryId'>

function scope(ctx: OrderContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function priced(line: StoredLine) {
  return { quantity: Number(line.quantity), rate: line.rate ?? null, gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) }
}

function storedData(row: CcQuotation): StoredData {
  return row.data as unknown as StoredData
}

function currencyOf(input: QuotationInput): string {
  return input.market === 'export' ? input.currency?.trim() || 'USD' : 'INR'
}

export function isExpired(row: Pick<CcQuotation, 'status' | 'validUntil'>, today = todayIst()): boolean {
  return (row.status === 'draft' || row.status === 'sent') && Boolean(row.validUntil) && String(row.validUntil) < today
}

export async function findQuotation(ctx: OrderContext, id: string) {
  const row = await ctx.em.findOne(CcQuotation, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new CrmError('Quotation not found', 404)
  return row
}

export async function quotationDetail(ctx: OrderContext, row: CcQuotation, revisionNo?: number | null) {
  const snapshot = revisionNo ? (row.revisions ?? []).find((rev) => rev.revision === revisionNo) : null
  if (revisionNo && !snapshot) throw new CrmError('That revision does not exist', 404)
  const data = (snapshot ? snapshot.data : storedData(row)) as StoredData
  const lines = data.lines ?? []
  const [customers, products, enquiry] = await Promise.all([
    loadCustomers(ctx, [row.customerId]),
    loadProducts(ctx, lines.map((line) => line.productId)),
    row.enquiryId ? ctx.em.findOne(CcEnquiry, { id: row.enquiryId, ...scope(ctx) }) : null,
  ])
  const includeGst = Boolean(data.pricesIncludeGst)
  return {
    ...data,
    id: row.id,
    quoteNo: row.quoteNo,
    orderNo: row.quoteNo,
    orderDate: snapshot?.quoteDate ?? row.quoteDate,
    quoteDate: snapshot?.quoteDate ?? row.quoteDate,
    validUntil: snapshot ? snapshot.validUntil : (row.validUntil ?? null),
    revision: snapshot?.revision ?? row.revision ?? 1,
    revisions: (row.revisions ?? []).map((rev) => ({ revision: rev.revision, at: rev.at, by: rev.by, reason: rev.reason, status: rev.status, totalAmount: rev.totalAmount, quoteDate: rev.quoteDate, sentAt: rev.sentAt })),
    enquiryId: row.enquiryId ?? null,
    enquiryNo: enquiry?.enquiryNo ?? null,
    customerId: row.customerId,
    customer: customers.get(row.customerId) ?? null,
    currency: row.currency,
    status: snapshot?.status ?? row.status,
    expired: snapshot ? false : isExpired(row),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    convertedOrderId: row.orderId ?? null,
    convertedOrderNo: row.orderNo ?? null,
    byName: row.byName ?? null,
    history: row.history ?? [],
    linesLocked: row.status === 'converted',
    lines: lines.map((line, index) => ({
      ...line,
      id: `${row.id}-${index + 1}`,
      position: index + 1,
      product: products.get(line.productId) ?? null,
      price: priceLine(priced(line), includeGst),
      specs: line.specs ?? {},
    })),
    totals: priceOrder(lines.map(priced), includeGst),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function splitInput(input: QuotationInput) {
  const { orderDate, customerId, validUntil, enquiryId, ...data } = input
  return { quoteDate: orderDate, customerId, validUntil: validUntil ?? null, enquiryId: enquiryId ?? null, data }
}

export async function saveQuotation(ctx: OrderContext, existing: CcQuotation | null, input: QuotationInput, byName: string | null) {
  await validateInput(ctx, input)
  if (input.validUntil && input.validUntil < input.orderDate) throw new CrmError('"Valid until" is before the quotation date')
  const parts = splitInput(input)
  const total = String(priceOrder(input.lines.map(priced), input.pricesIncludeGst).total)
  if (existing) {
    if (existing.status === 'converted') throw new CrmError('This quotation is already an order and can no longer be changed', 409)
    if (existing.status !== 'draft') throw new CrmError('This quotation has gone to the customer. Use Revise so the sent revision is kept, then edit.', 409)
    const changes = await quoteChanges(ctx, storedData(existing), Number(existing.totalAmount), existing.validUntil ?? null, parts.data as StoredData, Number(total), parts.validUntil)
    if (changes.length) recordActivity(ctx.em, ctx, { recordType: 'quotation', recordId: existing.id, action: 'edited', kind: 'change', summary: (existing.revision ?? 1) > 1 ? `Revision ${existing.revision} edited` : null, changes, actorUserId: ctx.userId ?? null, actorName: byName })
    Object.assign(existing, { quoteDate: parts.quoteDate, customerId: parts.customerId, validUntil: parts.validUntil, enquiryId: parts.enquiryId, data: parts.data, currency: currencyOf(input), totalAmount: total })
    existing.history = [...(existing.history ?? []), entry('edited', byName)]
    await ctx.em.flush()
    return existing
  }
  if (parts.enquiryId && !(await ctx.em.findOne(CcEnquiry, { id: parts.enquiryId, ...scope(ctx), deletedAt: null }))) throw new CrmError('Enquiry not found', 404)
  const row = await ctx.em.transactional(async (em) => {
    const created = em.create(CcQuotation, {
      ...scope(ctx),
      quoteNo: await nextSeriesCode({ ...ctx, em }, 'QT', new Date(`${parts.quoteDate}T00:00:00`)),
      quoteDate: parts.quoteDate,
      validUntil: parts.validUntil,
      enquiryId: parts.enquiryId,
      customerId: parts.customerId,
      currency: currencyOf(input),
      totalAmount: total,
      data: parts.data as unknown as Record<string, unknown>,
      byName,
      history: [entry('created', byName)],
    })
    em.persist(created)
    await em.flush()
    return created
  })
  await markEnquiry(ctx, row.enquiryId, 'quoted', byName, `Quotation ${row.quoteNo}`)
  if (parts.enquiryId) {
    const enquiry = await ctx.em.findOne(CcEnquiry, { id: parts.enquiryId, ...scope(ctx) })
    if (enquiry && !enquiry.customerId) {
      enquiry.customerId = parts.customerId
      await ctx.em.flush()
    }
  }
  return row
}

const CHANNEL_LABEL: Record<string, string> = { email: 'by email', whatsapp: 'on WhatsApp', hand: 'by hand', courier: 'by courier' }

export async function quotationAction(ctx: OrderContext, row: CcQuotation, action: QuotationAction, byName: string | null) {
  if (action.action === 'convert') return convertQuotation(ctx, row, action, byName)
  if (action.action === 'undo_convert') return undoConvert(ctx, row, action.note?.trim() ?? '', byName)
  if (row.status === 'converted') throw new CrmError('This quotation is already order {no}'.replace('{no}', row.orderNo ?? ''), 409)
  const reason = action.note?.trim() ?? ''
  const actor = { actorUserId: ctx.userId ?? null, actorName: byName }
  let note = action.note ?? null
  if (action.action === 'sent') {
    if (row.status === 'withdrawn') throw new CrmError('This quotation is withdrawn. Reopen it first.', 409)
    row.status = 'sent'
    row.sentAt = new Date()
    note = [action.sentTo ? `To ${action.sentTo}` : null, action.channel ? CHANNEL_LABEL[action.channel] : null, `revision ${row.revision ?? 1}`, action.note].filter(Boolean).join(' · ')
    recordActivity(ctx.em, ctx, { recordType: 'quotation', recordId: row.id, action: 'sent', kind: 'stage', summary: `Revision ${row.revision ?? 1} sent${action.sentTo ? ` to ${action.sentTo}` : ''}${action.channel ? ` ${CHANNEL_LABEL[action.channel]}` : ''}`, ...actor })
    await markEnquiry(ctx, row.enquiryId, 'negotiating', byName, `Quotation ${row.quoteNo} sent`)
  } else if (action.action === 'accepted') {
    if (row.status === 'withdrawn') throw new CrmError('This quotation is withdrawn. Reopen it first.', 409)
    row.status = 'accepted'
  } else if (action.action === 'rejected') {
    row.status = 'rejected'
    recordActivity(ctx.em, ctx, { recordType: 'quotation', recordId: row.id, action: 'rejected', kind: 'stage', summary: 'Rejected by the customer', reason, ...actor })
  } else if (action.action === 'revise') {
    if (row.status === 'draft') throw new CrmError('This quotation is still a draft; just edit it.', 409)
    const snapshot = { revision: row.revision ?? 1, at: new Date().toISOString(), by: byName, reason, quoteDate: row.quoteDate, validUntil: row.validUntil ?? null, totalAmount: Number(row.totalAmount), currency: row.currency, status: row.status, sentAt: row.sentAt ? row.sentAt.toISOString() : null, data: row.data as Record<string, unknown> }
    row.revisions = [...(row.revisions ?? []), snapshot]
    row.revision = snapshot.revision + 1
    row.status = 'draft'
    row.sentAt = null
    note = `Revision ${row.revision}: ${reason}`
    recordActivity(ctx.em, ctx, { recordType: 'quotation', recordId: row.id, action: 'revised', kind: 'change', summary: `Revision ${row.revision} started; revision ${snapshot.revision} (${snapshot.status}) kept with its PDF`, reason, ...actor })
  } else if (action.action === 'withdraw') {
    if (row.status === 'accepted') throw new CrmError('The customer accepted it. Convert it or revise it instead.', 409)
    if (row.status === 'withdrawn') throw new CrmError('Already withdrawn', 409)
    const from = row.status
    row.status = 'withdrawn'
    recordActivity(ctx.em, ctx, { recordType: 'quotation', recordId: row.id, action: 'withdrawn', kind: 'correction', summary: 'Withdrawn; the customer should not use it', reason, changes: [{ field: 'status', label: 'Status', from, to: 'withdrawn' }], ...actor })
  } else row.status = row.sentAt ? 'sent' : 'draft'
  row.history = [...(row.history ?? []), entry(action.action, byName, note)]
  await ctx.em.flush()
  return { quotation: row, order: null }
}

async function undoConvert(ctx: OrderContext, row: CcQuotation, reason: string, byName: string | null) {
  if (row.status !== 'converted' || !row.orderId) throw new CrmError('This quotation is not converted', 409)
  if (reason.length < 3) throw new CrmError('Write why (at least 3 letters); it is kept in the history')
  const connection = ctx.em.getConnection()
  const params = [row.orderId, ctx.tenantId, ctx.organizationId]
  const [paid] = await connection.execute<Array<{ total: string }>>(`select coalesce(sum(amount), 0) as total from cc_order_payments where order_id = ? and tenant_id = ? and organization_id = ? and voided_at is null`, params)
  if (Number(paid?.total ?? 0) > 0) throw new CrmError('The order already has an advance. Undo is not possible now.', 409)
  const [held] = await connection.execute<Array<{ total: string }>>(`select count(*) as total from cc_order_allocations where order_id = ? and tenant_id = ? and organization_id = ? and status in ('reserved', 'shipped')`, params)
  if (Number(held?.total ?? 0) > 0) throw new CrmError('Stock is already allocated to the order. Undo is not possible now.', 409)
  const [advance] = await connection.execute<Array<{ status: string }>>(`select status from cc_order_stages where order_id = ? and stage_key = 'advance' limit 1`, [row.orderId])
  if (advance && (advance.status === 'done' || advance.status === 'skipped')) throw new CrmError('The order has passed Advance / LC. Undo is not possible now.', 409)
  const order = await ctx.em.findOne(CcOrder, { id: row.orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  const orderNo = row.orderNo
  if (order && order.status !== 'cancelled') {
    order.status = 'cancelled'
    order.updatedAt = new Date()
    logEvent(ctx, order, 'cancelled', null, `Conversion of ${row.quoteNo} undone: ${reason}`, byName)
    await connection.execute(
      `update cc_proforma_invoices set status = 'cancelled', cancel_reason = ?, updated_at = now() where order_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and status <> 'cancelled'`,
      [`Order cancelled: ${reason}`, order.id, ctx.tenantId, ctx.organizationId],
    )
  }
  row.status = 'accepted'
  row.orderId = null
  row.orderNo = null
  row.history = [...(row.history ?? []), entry('undo_convert', byName, `${orderNo ?? ''} cancelled · ${reason}`)]
  if (row.enquiryId) {
    const enquiry = await ctx.em.findOne(CcEnquiry, { id: row.enquiryId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
    if (enquiry && enquiry.stage === 'won') {
      enquiry.stage = 'negotiating'
      enquiry.orderId = null
      enquiry.history = [...(enquiry.history ?? []), entry('undo_won', byName, `Order ${orderNo ?? ''} from ${row.quoteNo} undone · ${reason}`)]
    }
  }
  await ctx.em.flush()
  await logCorrection(ctx, { recordType: 'quotation', recordId: row.id, action: 'convert_undone', summary: `Conversion undone; order ${orderNo ?? ''} cancelled and the quotation is back to accepted`, reason, links: order ? [{ type: 'order', id: order.id, label: orderNo ?? null }] : [] })
  if (order) await logCorrection(ctx, { recordType: 'order', recordId: order.id, action: 'cancelled', summary: `Cancelled: conversion of ${row.quoteNo} undone`, reason, links: [{ type: 'quotation', id: row.id, label: row.quoteNo }] })
  return { quotation: row, order: null }
}

async function quoteChanges(ctx: OrderContext, before: StoredData, beforeTotal: number, beforeValid: string | null, after: StoredData, afterTotal: number, afterValid: string | null) {
  const changes: Array<{ field: string; label: string; from: string | number | null; to: string | number | null; money?: boolean }> = []
  const oldLines = before.lines ?? []
  const newLines = after.lines ?? []
  const titles = await loadProducts(ctx, [...oldLines, ...newLines].map((line) => line.productId))
  const name = (id: string) => titles.get(id)?.title ?? 'Item'
  for (const line of newLines) {
    const old = oldLines.find((entryLine) => entryLine.productId === line.productId)
    if (!old) {
      changes.push({ field: `line:${line.productId}:quantity`, label: `${name(line.productId)} qty`, from: null, to: Number(line.quantity) })
      continue
    }
    if (Number(old.quantity) !== Number(line.quantity)) changes.push({ field: `line:${line.productId}:quantity`, label: `${name(line.productId)} qty`, from: Number(old.quantity), to: Number(line.quantity) })
    if ((old.rate ?? null) !== (line.rate ?? null)) changes.push({ field: `line:${line.productId}:rate`, label: `${name(line.productId)} rate`, from: old.rate ?? null, to: line.rate ?? null, money: true })
  }
  for (const old of oldLines) if (!newLines.some((line) => line.productId === old.productId)) changes.push({ field: `line:${old.productId}:quantity`, label: `${name(old.productId)} qty`, from: Number(old.quantity), to: null })
  if (beforeValid !== afterValid) changes.push({ field: 'validUntil', label: 'Valid until', from: beforeValid, to: afterValid })
  if (Math.abs(beforeTotal - afterTotal) > 0.005) changes.push({ field: 'total', label: 'Total', from: beforeTotal, to: afterTotal, money: true })
  return changes
}

async function convertQuotation(ctx: OrderContext, row: CcQuotation, action: QuotationAction, byName: string | null) {
  if (row.status === 'converted') throw new CrmError('This quotation is already order {no}'.replace('{no}', row.orderNo ?? ''), 409)
  if (row.status === 'rejected') throw new CrmError('The customer rejected this quotation. Reopen it first.', 409)
  if (!(await hasFeatures(ctx, ['cc_orders.manage']))) throw new CrmError('You can see quotations but not book orders', 403)
  const data = storedData(row)
  const parsed = orderInputSchema.safeParse({
    ...data,
    orderDate: action.orderDate ?? todayIst(),
    customerId: row.customerId,
    customerPoRef: action.customerPoRef ?? data.customerPoRef ?? null,
    orderType: 'new',
    sourceOrderId: null,
  })
  if (!parsed.success) throw new CrmError('The quotation is missing order details. Open and save it first.')
  const order = await createOrderRecord(ctx, parsed.data, byName, `From quotation ${row.quoteNo}`)
  row.status = 'converted'
  row.orderId = order.id
  row.orderNo = order.orderNo
  row.history = [...(row.history ?? []), entry('converted', byName, order.orderNo)]
  await ctx.em.flush()
  await markEnquiry(ctx, row.enquiryId, 'won', byName, `Order ${order.orderNo} from ${row.quoteNo}`, order.id)
  return { quotation: row, order: { id: order.id, orderNo: order.orderNo } }
}

export async function listQuotations(ctx: OrderContext, query: { status: string; enquiryId?: string; orderId?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.enquiryId) where.enquiryId = query.enquiryId
  if (query.orderId) where.orderId = query.orderId
  if (query.status === 'open') where.status = { $in: ['draft', 'sent', 'accepted'] }
  else if (query.status !== 'all') where.status = query.status
  const rows = await ctx.em.find(CcQuotation, where, { orderBy: { createdAt: 'desc' }, limit: 500 })
  const customers = await loadCustomers(ctx, rows.map((row) => row.customerId))
  const enquiryIds = rows.map((row) => row.enquiryId).filter((id): id is string => Boolean(id))
  const enquiries = enquiryIds.length ? await ctx.em.find(CcEnquiry, { id: { $in: enquiryIds }, ...scope(ctx) }) : []
  const today = todayIst()
  return rows.map((row) => {
    const data = storedData(row)
    return {
      id: row.id,
      quoteNo: row.quoteNo,
      quoteDate: row.quoteDate,
      validUntil: row.validUntil ?? null,
      customerId: row.customerId,
      customerName: customers.get(row.customerId)?.name ?? '',
      enquiryId: row.enquiryId ?? null,
      enquiryNo: enquiries.find((enquiry) => enquiry.id === row.enquiryId)?.enquiryNo ?? null,
      market: data.market ?? 'domestic',
      incoterm: data.incoterm ?? null,
      currency: row.currency,
      totalAmount: Number(row.totalAmount),
      lineCount: (data.lines ?? []).length,
      status: row.status,
      expired: isExpired(row, today),
      orderId: row.orderId ?? null,
      orderNo: row.orderNo ?? null,
      byName: row.byName ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}
