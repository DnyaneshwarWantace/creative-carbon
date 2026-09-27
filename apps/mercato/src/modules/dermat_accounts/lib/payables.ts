import { randomUUID } from 'node:crypto'
import { currentUserName, type OrderContext } from '../../dermat_orders/lib/server'
import { Vendor } from '../../dermat_vendors/data/entities'
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine } from '../../dermat_purchase/data/entities'
import { VendorBill } from '../data/entities'
import type { VendorBillAction, VendorBillInput } from '../data/validators'
import { AccountsError } from './service'
import { nextSeriesCode } from './numberSeries'

const DAY_MS = 86400000

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function termDays(terms: string | null | undefined): number {
  const match = (terms ?? '').match(/(\d{1,3})\s*day/i)
  return match ? Number(match[1]) : 30
}

async function nextBillCode(ctx: OrderContext): Promise<string> {
  return nextSeriesCode(ctx, 'VB')
}

async function billedGrnIds(ctx: OrderContext, exceptBillId?: string): Promise<Set<string>> {
  const bills = await ctx.em.find(VendorBill, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $ne: 'cancelled' } })
  return new Set(bills.filter((bill) => bill.id !== exceptBillId).flatMap((bill) => bill.grnIds ?? []))
}

export async function grnAmounts(ctx: OrderContext, grnIds: string[]) {
  if (!grnIds.length) return []
  const grns = await ctx.em.find(GoodsReceipt, { id: { $in: grnIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  const lines = await ctx.em.find(GoodsReceiptLine, { grnId: { $in: grns.map((grn) => grn.id) } })
  const poLines = lines.length ? await ctx.em.find(PurchaseOrderLine, { id: { $in: [...new Set(lines.map((line) => line.poLineId))] } }) : []
  return grns.map((grn) => {
    let taxable = 0
    let gst = 0
    for (const line of lines.filter((entry) => entry.grnId === grn.id)) {
      const poLine = poLines.find((entry) => entry.id === line.poLineId)
      if (!poLine) continue
      const kept = Math.max(0, Number(line.quantity) - Number(line.returnedQty ?? 0))
      const value = kept * Number(poLine.rate)
      taxable += value
      gst += (value * Number(poLine.gstPercent ?? 0)) / 100
    }
    return { grnId: grn.id, code: grn.code, grnDate: grn.grnDate, poId: grn.poId, poCode: grn.poCode, vendorId: grn.vendorId, invoiceNo: grn.invoiceNo ?? null, taxable: money(taxable), gst: money(gst), total: money(taxable + gst) }
  })
}

export async function unbilledGrns(ctx: OrderContext, vendorId: string) {
  const billed = await billedGrnIds(ctx)
  const grns = await ctx.em.find(GoodsReceipt, { vendorId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }, { orderBy: { grnDate: 'asc' } })
  return grnAmounts(ctx, grns.filter((grn) => !billed.has(grn.id)).map((grn) => grn.id))
}

export async function findBill(ctx: OrderContext, id: string): Promise<VendorBill> {
  const bill = await ctx.em.findOne(VendorBill, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!bill) throw new AccountsError('Vendor bill not found', 404)
  return bill
}

export async function createBill(ctx: OrderContext, input: VendorBillInput): Promise<VendorBill> {
  const vendor = await ctx.em.findOne(Vendor, { id: input.vendorId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!vendor) throw new AccountsError('Vendor not found', 404)
  const duplicate = await ctx.em.findOne(VendorBill, { vendorId: vendor.id, billNo: input.billNo.trim(), tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $ne: 'cancelled' } })
  if (duplicate) throw new AccountsError(`Bill ${input.billNo} of ${vendor.name} is already entered as ${duplicate.code}`, 409)
  const billed = await billedGrnIds(ctx)
  const already = input.grnIds.filter((id) => billed.has(id))
  if (already.length) throw new AccountsError('One of these goods receipts is already on another bill', 409)
  const amounts = await grnAmounts(ctx, input.grnIds)
  if (amounts.length !== input.grnIds.length) throw new AccountsError('A goods receipt was not found', 404)
  if (amounts.some((entry) => entry.vendorId !== vendor.id)) throw new AccountsError('A goods receipt belongs to another vendor')
  const taxable = input.taxable ?? amounts.reduce((sum, entry) => sum + entry.taxable, 0)
  const gst = input.gst ?? amounts.reduce((sum, entry) => sum + entry.gst, 0)
  if (!(taxable + gst > 0)) throw new AccountsError('Enter the bill amount, or pick the goods receipts it covers')
  const po = amounts[0]?.poId ? await ctx.em.findOne(PurchaseOrder, { id: amounts[0].poId }) : null
  const byName = await currentUserName(ctx)
  const bill = ctx.em.create(VendorBill, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextBillCode(ctx),
    vendorId: vendor.id,
    vendorName: vendor.name,
    billNo: input.billNo.trim(),
    billDate: input.billDate,
    dueDate: input.dueDate ?? addDays(input.billDate, termDays(vendor.paymentTerms)),
    poId: po?.id ?? null,
    poCode: po?.code ?? null,
    grnIds: amounts.map((entry) => entry.grnId),
    grnCodes: amounts.map((entry) => entry.code),
    taxable: String(money(taxable)),
    gst: String(money(gst)),
    total: String(money(taxable + gst)),
    notes: input.notes ?? null,
    payments: [],
    createdByName: byName,
    history: [{ action: 'entered', by: byName, at: new Date().toISOString(), note: null }],
  })
  ctx.em.persist(bill)
  await ctx.em.flush()
  return bill
}

export async function actOnBill(ctx: OrderContext, bill: VendorBill, input: VendorBillAction) {
  const byName = await currentUserName(ctx)
  const balance = money(Number(bill.total) - Number(bill.paid))
  if (input.action === 'pay') {
    if (bill.status === 'cancelled' || bill.status === 'paid') throw new AccountsError('This bill is closed', 409)
    const amount = money(input.amount ?? balance)
    if (amount > balance + 0.005) throw new AccountsError(`Only ₹${balance} is left to pay on this bill`, 409)
    const payment = { id: randomUUID(), amount, paidOn: input.paidOn ?? todayIst(), mode: input.mode ?? null, reference: input.reference ?? null, by: byName, at: new Date().toISOString() }
    bill.payments = [...(bill.payments ?? []), payment]
    bill.paid = String(money(Number(bill.paid) + amount))
    bill.status = Number(bill.paid) >= Number(bill.total) - 0.005 ? 'paid' : 'partly_paid'
    bill.history = [...(bill.history ?? []), { action: 'paid', by: byName, at: new Date().toISOString(), note: `₹${amount}${payment.reference ? ` · ${payment.reference}` : ''}` }]
  } else {
    if (Number(bill.paid) > 0) throw new AccountsError('A bill with payments cannot be cancelled', 409)
    if (!input.note) throw new AccountsError('Write why the bill is cancelled')
    bill.status = 'cancelled'
    bill.history = [...(bill.history ?? []), { action: 'cancelled', by: byName, at: new Date().toISOString(), note: input.note }]
  }
  bill.updatedAt = new Date()
  await ctx.em.flush()
}

export function billView(bill: VendorBill) {
  const total = Number(bill.total)
  const paid = Number(bill.paid)
  const today = todayIst()
  const open = bill.status !== 'paid' && bill.status !== 'cancelled'
  return {
    id: bill.id,
    code: bill.code,
    vendorId: bill.vendorId,
    vendorName: bill.vendorName,
    billNo: bill.billNo,
    billDate: bill.billDate,
    dueDate: bill.dueDate ?? null,
    poId: bill.poId ?? null,
    poCode: bill.poCode ?? null,
    grnIds: bill.grnIds ?? [],
    grnCodes: bill.grnCodes ?? [],
    taxable: Number(bill.taxable),
    gst: Number(bill.gst),
    total,
    paid,
    balance: money(total - paid),
    status: bill.status,
    overdueDays: open && bill.dueDate && bill.dueDate < today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bill.dueDate}T00:00:00Z`)) / DAY_MS) : 0,
    notes: bill.notes ?? null,
    payments: bill.payments ?? [],
    history: bill.history ?? [],
    createdByName: bill.createdByName ?? null,
    updatedAt: bill.updatedAt.toISOString(),
  }
}
