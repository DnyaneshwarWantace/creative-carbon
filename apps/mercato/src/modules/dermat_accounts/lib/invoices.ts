import { DermatOrderLine, DermatOrderStage } from '../../dermat_orders/data/entities'
import { logEvent } from '../../dermat_orders/lib/engine'
import { priceLine } from '../../dermat_orders/lib/pricing'
import { findOrder, loadCustomers, loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { stepStates } from '../../dermat_orders/lib/stages'
import { TaxInvoice, type InvoiceLine, type InvoiceTotals } from '../data/entities'
import { bankText, companyView, financialYear, loadCompany } from './documents'
import { AccountsError } from './service'

type Scope = OrderContext

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function stateOf(gstin: string | null | undefined): string | null {
  const code = (gstin ?? '').slice(0, 2)
  return /^\d{2}$/.test(code) ? code : null
}

const TERM_DAYS: Record<string, number> = { due_on_delivery: 0, '15_days': 15, '30_days': 30, '45_days': 45, '60_days': 60, '90_days': 90 }

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function nextCode(ctx: Scope, kind: 'INV' | 'CN'): Promise<string> {
  const prefix = `DI/${kind}/${financialYear(new Date())}/`
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(code from length(?) + 1), '')::int) as max from dermat_tax_invoices where tenant_id = ? and organization_id = ? and code like ?`,
    [prefix, ctx.tenantId, ctx.organizationId, `${prefix}%`],
    'all',
    ctx.em.getTransactionContext(),
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`
}

export async function invoicedByLine(ctx: Scope, orderId: string, excludeId?: string): Promise<Map<string, number>> {
  const docs = await ctx.em.find(TaxInvoice, { orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $ne: 'cancelled' } })
  const result = new Map<string, number>()
  for (const doc of docs) {
    if (doc.id === excludeId) continue
    const sign = doc.kind === 'credit_note' ? -1 : 1
    for (const line of doc.lines) result.set(line.orderLineId, (result.get(line.orderLineId) ?? 0) + sign * line.quantity)
  }
  return result
}

function splitTax(line: Omit<InvoiceLine, 'cgst' | 'sgst' | 'igst'>, interState: boolean): InvoiceLine {
  if (interState) return { ...line, cgst: 0, sgst: 0, igst: line.gst }
  const half = round(line.gst / 2)
  return { ...line, cgst: half, sgst: round(line.gst - half), igst: 0 }
}

function totalsOf(lines: InvoiceLine[]): InvoiceTotals {
  const sum = (key: 'taxable' | 'gst' | 'total' | 'cgst' | 'sgst' | 'igst') => round(lines.reduce((acc, line) => acc + line[key], 0))
  const gross = round(lines.reduce((acc, line) => acc + line.quantity * (line.rate ?? 0), 0))
  const total = sum('total')
  const payable = Math.round(total)
  const discount = round(lines.reduce((acc, line) => acc + (line.quantity * (line.rate ?? 0) * line.discountPercent) / 100, 0))
  return { gross, discount, taxable: sum('taxable'), gst: sum('gst'), total, cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), roundOff: round(payable - total), payable }
}

async function buildLines(
  ctx: Scope,
  orderId: string,
  pricesIncludeGst: boolean,
  wanted: Array<{ orderLineId: string; quantity: number }> | null,
  interState: boolean,
  limit: Map<string, number>,
): Promise<InvoiceLine[]> {
  const orderLines = await ctx.em.find(DermatOrderLine, { orderId }, { orderBy: { position: 'asc' } })
  const products = await loadProducts(ctx, orderLines.map((line) => line.productId))
  const hsnRows = orderLines.length
    ? await ctx.em.getConnection().execute<Array<{ record_id: string; value_text: string | null }>>(
        `select record_id, value_text from custom_field_values where field_key = 'hsn_code' and deleted_at is null and record_id = any(?::text[])`,
        [`{${orderLines.map((line) => line.productId).join(',')}}`],
      )
    : []
  const hsn = new Map(hsnRows.map((row) => [row.record_id, row.value_text]))
  const result: InvoiceLine[] = []
  for (const line of orderLines) {
    const available = limit.get(line.id) ?? 0
    const requested = wanted ? (wanted.find((entry) => entry.orderLineId === line.id)?.quantity ?? 0) : available
    if (requested <= 0) continue
    const product = products.get(line.productId)
    if (requested > available + 1e-9) throw new AccountsError(`${product?.title ?? 'A product'}: only ${available} pcs are left to bill`)
    const input = { quantity: requested, rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) }
    if (input.rate == null) throw new AccountsError(`${product?.title ?? 'A product'} has no rate on the order`)
    const price = priceLine(input, pricesIncludeGst)
    result.push(
      splitTax(
        {
          orderLineId: line.id,
          productId: line.productId,
          code: product?.code ?? null,
          title: product?.title ?? '(deleted product)',
          brandName: line.brandName ?? null,
          packSize: line.packSize ?? null,
          hsn: hsn.get(line.productId) ?? null,
          quantity: requested,
          rate: input.rate,
          discountPercent: input.discountPercent,
          gstPercent: input.gstPercent,
          taxable: price.taxable,
          gst: price.gst,
          total: price.total,
        },
        interState,
      ),
    )
  }
  if (!result.length) throw new AccountsError('Nothing left to bill on this order')
  return result
}

export async function createInvoice(
  ctx: Scope,
  input: { orderId: string; invoiceDate?: string | null; lines?: Array<{ orderLineId: string; quantity: number }> | null; notes?: string | null },
  byName: string | null,
): Promise<TaxInvoice> {
  const order = await findOrder(ctx, input.orderId)
  if (order.status === 'cancelled') throw new AccountsError('This order is cancelled', 409)
  const [customers, companyRow] = await Promise.all([loadCustomers(ctx, [order.customerId]), loadCompany(ctx)])
  const company = companyView(companyRow)
  const customer = customers.get(order.customerId)
  const own = stateOf(company.gstin)
  const theirs = stateOf(customer?.gstin)
  const interState = Boolean(own && theirs && own !== theirs)
  const orderLines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
  const already = await invoicedByLine(ctx, order.id)
  const left = new Map(orderLines.map((line) => [line.id, Math.max(0, Number(line.quantity) - (already.get(line.id) ?? 0))]))
  const lines = await buildLines(ctx, order.id, order.pricesIncludeGst, input.lines ?? null, interState, left)
  const invoiceDate = input.invoiceDate || new Date().toISOString().slice(0, 10)
  const dispatch = (await ctx.em.findOne(DermatOrderStage, { orderId: order.id, stageKey: 'dispatch' }))?.data ?? {}
  const invoice = ctx.em.create(TaxInvoice, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'INV'),
    kind: 'invoice',
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: customer?.name ?? '',
    customerGstin: customer?.gstin ?? null,
    invoiceDate,
    dueDate: addDays(invoiceDate, TERM_DAYS[order.paymentTerms ?? ''] ?? 0),
    status: 'draft',
    interState,
    placeOfSupply: theirs ? `${theirs} ${GST_STATES[theirs] ?? ''}`.trim() : own ? `${own} ${GST_STATES[own] ?? ''}`.trim() : null,
    pricesIncludeGst: order.pricesIncludeGst,
    lines,
    totals: totalsOf(lines),
    transporter: typeof dispatch.transporter === 'string' ? dispatch.transporter : null,
    lrNo: typeof dispatch.lr_number === 'string' ? dispatch.lr_number : null,
    terms: company.invoiceTerms,
    bankDetails: bankText(company),
    notes: input.notes ?? order.billingRemarks ?? null,
    createdByName: byName,
    history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: `From order ${order.orderNo}` }],
  })
  ctx.em.persist(invoice)
  logEvent(ctx, order, 'invoice_created', 'billing', `Tax invoice ${invoice.code} drafted`, byName)
  return invoice
}

export async function updateInvoiceLines(ctx: Scope, invoice: TaxInvoice, wanted: Array<{ orderLineId: string; quantity: number }>, byName: string | null): Promise<void> {
  if (invoice.status !== 'draft') throw new AccountsError('Only a draft invoice can change its quantities', 409)
  const order = await findOrder(ctx, invoice.orderId)
  const orderLines = await ctx.em.find(DermatOrderLine, { orderId: order.id })
  const already = await invoicedByLine(ctx, order.id, invoice.id)
  const left = new Map(orderLines.map((line) => [line.id, Math.max(0, Number(line.quantity) - (already.get(line.id) ?? 0))]))
  invoice.lines = await buildLines(ctx, order.id, invoice.pricesIncludeGst, wanted, invoice.interState, left)
  invoice.totals = totalsOf(invoice.lines)
  invoice.history = [...(invoice.history ?? []), { action: 'quantities', by: byName, at: new Date().toISOString(), note: invoice.lines.map((line) => `${line.title} ${line.quantity}`).join(', ') }]
}

export async function issueInvoice(ctx: Scope, invoice: TaxInvoice, byName: string | null): Promise<void> {
  if (invoice.status !== 'draft') throw new AccountsError(invoice.status === 'issued' ? 'Already issued' : 'This invoice is cancelled', 409)
  invoice.status = 'issued'
  invoice.issuedAt = new Date()
  invoice.issuedByName = byName
  invoice.history = [...(invoice.history ?? []), { action: 'issued', by: byName, at: new Date().toISOString(), note: null }]
  const order = await findOrder(ctx, invoice.orderId)
  if (invoice.kind === 'invoice') {
    const stage = await ctx.em.findOne(DermatOrderStage, { orderId: order.id, stageKey: 'billing' })
    if (stage && (stage.status === 'open' || stage.status === 'on_hold')) {
      const data = { ...(stage.data ?? {}) } as Record<string, unknown>
      const current = typeof data.invoice_number === 'string' && data.invoice_number.trim() ? data.invoice_number.split(',').map((value) => value.trim()) : []
      data.invoice_number = Array.from(new Set([...current, invoice.code])).join(', ')
      data.invoice_date = invoice.invoiceDate
      data.__steps = { ...stepStates(data), invoice: { done: true, at: new Date().toISOString(), by: byName } }
      if (!data.__started) data.__started = { at: new Date().toISOString(), by: byName }
      stage.data = data
      order.updatedAt = new Date()
    }
  }
  logEvent(ctx, order, invoice.kind === 'invoice' ? 'invoice_issued' : 'credit_note', 'billing', `${invoice.kind === 'invoice' ? 'Tax invoice' : `Credit note against ${invoice.againstCode}`} ${invoice.code} · ₹${invoice.totals.payable.toLocaleString('en-IN')}`, byName)
}

export async function createCreditNote(
  ctx: Scope,
  invoice: TaxInvoice,
  input: { lines: Array<{ orderLineId: string; quantity: number }>; reason: string },
  byName: string | null,
): Promise<TaxInvoice> {
  if (invoice.kind !== 'invoice' || invoice.status !== 'issued') throw new AccountsError('A credit note is made against an issued invoice', 409)
  const credited = await ctx.em.find(TaxInvoice, { againstId: invoice.id, kind: 'credit_note', status: { $ne: 'cancelled' }, deletedAt: null })
  const left = new Map(invoice.lines.map((line) => [line.orderLineId, line.quantity - credited.reduce((acc, note) => acc + (note.lines.find((entry) => entry.orderLineId === line.orderLineId)?.quantity ?? 0), 0)]))
  const lines: InvoiceLine[] = []
  for (const wanted of input.lines) {
    if (wanted.quantity <= 0) continue
    const source = invoice.lines.find((line) => line.orderLineId === wanted.orderLineId)
    if (!source) throw new AccountsError('That product is not on the invoice')
    if (wanted.quantity > (left.get(source.orderLineId) ?? 0) + 1e-9) throw new AccountsError(`${source.title}: only ${left.get(source.orderLineId) ?? 0} pcs can still be credited`)
    const price = priceLine({ quantity: wanted.quantity, rate: source.rate, gstPercent: source.gstPercent, discountPercent: source.discountPercent }, invoice.pricesIncludeGst)
    lines.push(splitTax({ ...source, quantity: wanted.quantity, taxable: price.taxable, gst: price.gst, total: price.total }, invoice.interState))
  }
  if (!lines.length) throw new AccountsError('Enter the quantity to credit')
  const note = ctx.em.create(TaxInvoice, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'CN'),
    kind: 'credit_note',
    againstId: invoice.id,
    againstCode: invoice.code,
    orderId: invoice.orderId,
    orderNo: invoice.orderNo,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerGstin: invoice.customerGstin ?? null,
    invoiceDate: new Date().toISOString().slice(0, 10),
    status: 'draft',
    interState: invoice.interState,
    placeOfSupply: invoice.placeOfSupply ?? null,
    pricesIncludeGst: invoice.pricesIncludeGst,
    lines,
    totals: totalsOf(lines),
    notes: input.reason,
    createdByName: byName,
    history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: input.reason }],
  })
  ctx.em.persist(note)
  await issueInvoice(ctx, note, byName)
  return note
}

export function invoiceView(invoice: TaxInvoice) {
  return {
    id: invoice.id,
    code: invoice.code,
    kind: invoice.kind,
    againstId: invoice.againstId ?? null,
    againstCode: invoice.againstCode ?? null,
    orderId: invoice.orderId,
    orderNo: invoice.orderNo,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerGstin: invoice.customerGstin ?? null,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate ?? null,
    status: invoice.status,
    interState: invoice.interState,
    placeOfSupply: invoice.placeOfSupply ?? null,
    pricesIncludeGst: invoice.pricesIncludeGst,
    lines: invoice.lines,
    totals: invoice.totals,
    transporter: invoice.transporter ?? null,
    vehicleNo: invoice.vehicleNo ?? null,
    lrNo: invoice.lrNo ?? null,
    ewayBillNo: invoice.ewayBillNo ?? null,
    terms: invoice.terms ?? null,
    bankDetails: invoice.bankDetails ?? null,
    notes: invoice.notes ?? null,
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    issuedByName: invoice.issuedByName ?? null,
    createdByName: invoice.createdByName ?? null,
    cancelReason: invoice.cancelReason ?? null,
    history: invoice.history ?? [],
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

export async function findInvoice(ctx: Scope, id: string): Promise<TaxInvoice> {
  const invoice = await ctx.em.findOne(TaxInvoice, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!invoice) throw new AccountsError('Invoice not found', 404)
  return invoice
}
