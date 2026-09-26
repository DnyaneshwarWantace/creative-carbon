import { DermatOrderLine, DermatOrderStage, type DermatOrder } from '../../dermat_orders/data/entities'
import { logEvent } from '../../dermat_orders/lib/engine'
import { priceLine, priceOrder } from '../../dermat_orders/lib/pricing'
import { findOrder, loadCustomers, loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { stepStates } from '../../dermat_orders/lib/stages'
import { CompanyProfile, ProformaInvoice, type PiLine } from '../data/entities'
import { AccountsError } from './service'

export const DEFAULT_COMPANY = {
  name: 'Dermat India',
  legalName: null as string | null,
  gstin: null as string | null,
  pan: null as string | null,
  address: null as string | null,
  phone: null as string | null,
  email: null as string | null,
  website: null as string | null,
  bankName: null as string | null,
  bankBranch: null as string | null,
  bankAccount: null as string | null,
  bankIfsc: null as string | null,
  upiId: null as string | null,
  signatory: null as string | null,
  piTerms: '1. Prices are ex-works unless stated.\n2. Advance as mentioned confirms the order; balance before dispatch.\n3. Delivery date is counted from advance receipt and artwork approval.\n4. Subject to local jurisdiction.' as string | null,
  invoiceTerms: '1. Goods once dispatched will not be taken back.\n2. Interest @ 18% p.a. on payments delayed beyond the due date.\n3. Subject to local jurisdiction.' as string | null,
  piValidityDays: 15,
  grnOverPercent: 0,
}

export type CompanyView = typeof DEFAULT_COMPANY & { id: string | null; updatedAt: string | null }

type Scope = OrderContext

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

export async function loadCompany(ctx: Pick<Scope, 'em' | 'tenantId' | 'organizationId'>): Promise<CompanyProfile | null> {
  return ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
}

export function companyView(profile: CompanyProfile | null): CompanyView {
  if (!profile) return { ...DEFAULT_COMPANY, id: null, updatedAt: null }
  return {
    id: profile.id,
    name: profile.name,
    legalName: profile.legalName ?? null,
    gstin: profile.gstin ?? null,
    pan: profile.pan ?? null,
    address: profile.address ?? null,
    phone: profile.phone ?? null,
    email: profile.email ?? null,
    website: profile.website ?? null,
    bankName: profile.bankName ?? null,
    bankBranch: profile.bankBranch ?? null,
    bankAccount: profile.bankAccount ?? null,
    bankIfsc: profile.bankIfsc ?? null,
    upiId: profile.upiId ?? null,
    signatory: profile.signatory ?? null,
    piTerms: profile.piTerms ?? null,
    invoiceTerms: profile.invoiceTerms ?? null,
    piValidityDays: profile.piValidityDays,
    grnOverPercent: profile.grnOverPercent,
    updatedAt: profile.updatedAt.toISOString(),
  }
}

export function bankText(company: CompanyView): string | null {
  const parts = [
    company.bankName ? `Bank: ${company.bankName}` : null,
    company.bankBranch ? `Branch: ${company.bankBranch}` : null,
    company.bankAccount ? `A/c no.: ${company.bankAccount}` : null,
    company.bankIfsc ? `IFSC: ${company.bankIfsc}` : null,
    company.upiId ? `UPI: ${company.upiId}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join('\n') : null
}

async function nextPiCode(ctx: Scope): Promise<string> {
  const prefix = `DI/PI/${financialYear(new Date())}/`
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(code from length(?) + 1), '')::int) as max from dermat_proforma_invoices where tenant_id = ? and organization_id = ? and code like ?`,
    [prefix, ctx.tenantId, ctx.organizationId, `${prefix}%`],
    'all',
    ctx.em.getTransactionContext(),
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(3, '0')}`
}

export function advanceFromRemarks(remarks: string | null | undefined): number | null {
  const match = (remarks ?? '').match(/(\d{1,3})\s*%\s*advance/i)
  if (!match) return null
  const value = Number(match[1])
  return value > 0 && value <= 100 ? value : null
}

async function hsnCodes(ctx: Scope, productIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!productIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ record_id: string; value_text: string | null }>>(
    `select record_id, value_text from custom_field_values where field_key = 'hsn_code' and deleted_at is null and record_id = any(?::text[])`,
    [`{${productIds.join(',')}}`],
  )
  for (const row of rows) if (row.value_text) result.set(row.record_id, row.value_text)
  return result
}

export async function linesFromOrder(ctx: Scope, order: DermatOrder): Promise<{ lines: PiLine[]; totals: ReturnType<typeof priceOrder> }> {
  const orderLines = await ctx.em.find(DermatOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } })
  const products = await loadProducts(ctx, orderLines.map((line) => line.productId))
  const hsn = await hsnCodes(ctx, orderLines.map((line) => line.productId))
  const priced = orderLines.map((line) => ({ quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) }))
  const lines: PiLine[] = orderLines.map((line, index) => {
    const price = priceLine(priced[index], order.pricesIncludeGst)
    const product = products.get(line.productId)
    return {
      productId: line.productId,
      code: product?.code ?? null,
      title: product?.title ?? '(deleted product)',
      brandName: line.brandName ?? null,
      packSize: line.packSize ?? null,
      hsn: hsn.get(line.productId) ?? null,
      quantity: priced[index].quantity,
      rate: priced[index].rate,
      discountPercent: priced[index].discountPercent,
      gstPercent: priced[index].gstPercent,
      taxable: price.taxable,
      gst: price.gst,
      total: price.total,
    }
  })
  return { lines, totals: priceOrder(priced, order.pricesIncludeGst) }
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export async function createPi(
  ctx: Scope,
  input: { orderId: string; piDate?: string | null; validUntil?: string | null; advancePercent?: number | null; terms?: string | null; bankDetails?: string | null; notes?: string | null },
  byName: string | null,
): Promise<ProformaInvoice> {
  const order = await findOrder(ctx, input.orderId)
  if (order.status === 'cancelled') throw new AccountsError('This order is cancelled', 409)
  const [customers, companyRow] = await Promise.all([loadCustomers(ctx, [order.customerId]), loadCompany(ctx)])
  const company = companyView(companyRow)
  const customer = customers.get(order.customerId)
  const { lines, totals } = await linesFromOrder(ctx, order)
  if (!lines.some((line) => line.rate !== null)) throw new AccountsError('Enter the rate on the order lines before making a proforma invoice')
  const piDate = input.piDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const pi = ctx.em.create(ProformaInvoice, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextPiCode(ctx),
    orderId: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: customer?.name ?? '',
    customerGstin: customer?.gstin ?? null,
    piDate,
    validUntil: input.validUntil || addDays(piDate, company.piValidityDays || 15),
    status: 'draft',
    advancePercent: String(input.advancePercent ?? advanceFromRemarks(order.paymentRemarks) ?? advanceFromRemarks(customer?.paymentRemarks) ?? 40),
    pricesIncludeGst: order.pricesIncludeGst,
    lines,
    totals,
    terms: input.terms ?? company.piTerms,
    bankDetails: input.bankDetails ?? bankText(company),
    notes: input.notes ?? null,
    createdByName: byName,
    history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: `From order ${order.orderNo}` }],
  })
  ctx.em.persist(pi)
  logEvent(ctx, order, 'pi_created', 'advance', `Proforma invoice ${pi.code} drafted`, byName)
  return pi
}

export async function refreshPiLines(ctx: Scope, pi: ProformaInvoice, byName: string | null): Promise<void> {
  const order = await findOrder(ctx, pi.orderId)
  const { lines, totals } = await linesFromOrder(ctx, order)
  pi.lines = lines
  pi.totals = totals
  pi.pricesIncludeGst = order.pricesIncludeGst
  pi.history = [...(pi.history ?? []), { action: 'refreshed', by: byName, at: new Date().toISOString(), note: 'Lines and totals taken again from the order' }]
}

export async function markPiSent(ctx: Scope, pi: ProformaInvoice, byName: string | null): Promise<void> {
  if (pi.status === 'cancelled') throw new AccountsError('This proforma invoice is cancelled', 409)
  pi.status = 'sent'
  pi.sentAt = new Date()
  pi.sentByName = byName
  pi.history = [...(pi.history ?? []), { action: 'sent', by: byName, at: new Date().toISOString(), note: null }]
  const order = await findOrder(ctx, pi.orderId)
  const stage = await ctx.em.findOne(DermatOrderStage, { orderId: order.id, stageKey: 'advance' })
  if (stage && (stage.status === 'open' || stage.status === 'on_hold')) {
    const data = { ...(stage.data ?? {}) } as Record<string, unknown>
    const percent = Number(pi.advancePercent ?? 0)
    data.pi_number = pi.code
    if (percent) data.advance_percent = percent
    if (!data.advance_amount && percent) data.advance_amount = round((pi.totals.total * percent) / 100)
    data.__steps = { ...stepStates(data), pi_sent: { done: true, at: new Date().toISOString(), by: byName } }
    if (!data.__started) data.__started = { at: new Date().toISOString(), by: byName }
    stage.data = data
    order.updatedAt = new Date()
  }
  logEvent(ctx, order, 'pi_sent', 'advance', `Proforma invoice ${pi.code} sent to the customer`, byName)
}

export function piView(pi: ProformaInvoice) {
  const percent = pi.advancePercent == null ? null : Number(pi.advancePercent)
  return {
    id: pi.id,
    code: pi.code,
    orderId: pi.orderId,
    orderNo: pi.orderNo,
    customerId: pi.customerId,
    customerName: pi.customerName,
    customerGstin: pi.customerGstin ?? null,
    piDate: pi.piDate,
    validUntil: pi.validUntil ?? null,
    status: pi.status,
    advancePercent: percent,
    advanceAmount: percent ? round((pi.totals.total * percent) / 100) : null,
    pricesIncludeGst: pi.pricesIncludeGst,
    lines: pi.lines,
    totals: pi.totals,
    terms: pi.terms ?? null,
    bankDetails: pi.bankDetails ?? null,
    notes: pi.notes ?? null,
    sentAt: pi.sentAt ? pi.sentAt.toISOString() : null,
    sentByName: pi.sentByName ?? null,
    createdByName: pi.createdByName ?? null,
    cancelReason: pi.cancelReason ?? null,
    history: pi.history ?? [],
    createdAt: pi.createdAt.toISOString(),
    updatedAt: pi.updatedAt.toISOString(),
  }
}

export async function findPi(ctx: Scope, id: string): Promise<ProformaInvoice> {
  const pi = await ctx.em.findOne(ProformaInvoice, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!pi) throw new AccountsError('Proforma invoice not found', 404)
  return pi
}
