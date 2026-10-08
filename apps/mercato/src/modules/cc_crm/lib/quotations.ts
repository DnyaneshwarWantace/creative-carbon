import type { OrderContext } from '../../cc_orders/lib/server'
import { hasFeatures, loadCustomers, loadProducts } from '../../cc_orders/lib/server'
import { createOrderRecord, validateInput } from '../../cc_orders/lib/orderCreate'
import { orderInputSchema } from '../../cc_orders/data/validators'
import { priceLine, priceOrder } from '../../cc_orders/lib/pricing'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { CcEnquiry, CcQuotation } from '../data/entities'
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

export async function quotationDetail(ctx: OrderContext, row: CcQuotation) {
  const data = storedData(row)
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
    orderDate: row.quoteDate,
    quoteDate: row.quoteDate,
    validUntil: row.validUntil ?? null,
    enquiryId: row.enquiryId ?? null,
    enquiryNo: enquiry?.enquiryNo ?? null,
    customerId: row.customerId,
    customer: customers.get(row.customerId) ?? null,
    currency: row.currency,
    status: row.status,
    expired: isExpired(row),
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

export async function quotationAction(ctx: OrderContext, row: CcQuotation, action: QuotationAction, byName: string | null) {
  if (action.action === 'convert') return convertQuotation(ctx, row, action, byName)
  if (row.status === 'converted') throw new CrmError('This quotation is already order {no}'.replace('{no}', row.orderNo ?? ''), 409)
  if (action.action === 'sent') {
    row.status = 'sent'
    row.sentAt = new Date()
    await markEnquiry(ctx, row.enquiryId, 'negotiating', byName, `Quotation ${row.quoteNo} sent`)
  } else if (action.action === 'accepted') row.status = 'accepted'
  else if (action.action === 'rejected') row.status = 'rejected'
  else row.status = row.sentAt ? 'sent' : 'draft'
  row.history = [...(row.history ?? []), entry(action.action, byName, action.note)]
  await ctx.em.flush()
  return { quotation: row, order: null }
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

export async function listQuotations(ctx: OrderContext, query: { status: string; enquiryId?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.enquiryId) where.enquiryId = query.enquiryId
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
