import { Vendor } from '../../cc_vendors/data/entities'
import { loadCustomers, type OrderContext } from '../../cc_orders/lib/server'
import { CcOrder } from '../../cc_orders/data/entities'
import { OrderPayment, TaxInvoice, DebitNote, VendorBill } from '../data/entities'
import { loadCompany } from './documents'
import { stateFromGstin } from './gstStates'

export type TallyKind = 'sales' | 'credit_notes' | 'receipts' | 'purchases' | 'payments'

export const TALLY_KINDS: TallyKind[] = ['sales', 'credit_notes', 'receipts', 'purchases', 'payments']

export const DEFAULT_LEDGERS = {
  sales: 'Sales @ GST',
  exportSales: 'Export Sales',
  purchase: 'Purchase @ GST',
  outputCgst: 'Output CGST',
  outputSgst: 'Output SGST',
  outputIgst: 'Output IGST',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  bank: 'Bank Account',
  roundOff: 'Round Off',
}

export type TallyLedgers = typeof DEFAULT_LEDGERS

type Entry = { ledger: string; amount: number }

export type TallyVoucher = {
  type: 'Sales' | 'Credit Note' | 'Receipt' | 'Purchase' | 'Payment' | 'Debit Note'
  date: string
  number: string
  reference: string | null
  party: string
  narration: string
  entries: Entry[]
  recordId?: string | null
}

export type TallyParty = { name: string; group: 'Sundry Debtors' | 'Sundry Creditors'; gstin: string | null; state: string | null }

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function between(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

function splitGst(total: number, interState: boolean): { cgst: number; sgst: number; igst: number } {
  if (interState) return { cgst: 0, sgst: 0, igst: round2(total) }
  const half = round2(total / 2)
  return { cgst: half, sgst: round2(total - half), igst: 0 }
}

export async function tallyData(ctx: OrderContext, range: { from: string; to: string }, kinds: TallyKind[], ledgers: TallyLedgers) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const company = await loadCompany(ctx)
  const homeState = stateFromGstin(company?.gstin)?.code ?? null
  const vouchers: TallyVoucher[] = []
  const parties = new Map<string, TallyParty>()
  const want = new Set(kinds)

  if (want.has('sales') || want.has('credit_notes')) {
    const invoices = await ctx.em.find(TaxInvoice, { ...scope, deletedAt: null, status: 'issued' }, { orderBy: { invoiceDate: 'asc', code: 'asc' } })
    for (const invoice of invoices) {
      if (!between(invoice.invoiceDate, range.from, range.to)) continue
      const credit = invoice.kind === 'credit_note'
      if ((credit && !want.has('credit_notes')) || (!credit && !want.has('sales'))) continue
      const totals = invoice.totals
      const sign = credit ? -1 : 1
      const exp = invoice.exportDetails
      const rate = exp && exp.currency !== 'INR' ? Number(exp.exchangeRate ?? 0) || 1 : 1
      const inr = (value: number) => round2(value * rate)
      const entries: Entry[] = [{ ledger: exp ? ledgers.exportSales : ledgers.sales, amount: sign * inr(totals.taxable) }]
      if (totals.cgst) entries.push({ ledger: ledgers.outputCgst, amount: sign * inr(totals.cgst) })
      if (totals.sgst) entries.push({ ledger: ledgers.outputSgst, amount: sign * inr(totals.sgst) })
      if (totals.igst) entries.push({ ledger: ledgers.outputIgst, amount: sign * inr(totals.igst) })
      const partyAmount = rate === 1 ? round2(totals.payable) : inr(totals.payable)
      const roundOff = round2(partyAmount - entries.reduce((sum, entry) => sum + sign * entry.amount, 0))
      if (roundOff) entries.push({ ledger: ledgers.roundOff, amount: sign * roundOff })
      entries.unshift({ ledger: invoice.customerName, amount: -sign * partyAmount })
      vouchers.push({ type: credit ? 'Credit Note' : 'Sales', date: invoice.invoiceDate, number: invoice.code, reference: invoice.againstCode ?? invoice.orderNo, party: invoice.customerName, narration: [`${credit ? 'Credit note' : exp ? 'Export invoice' : 'Invoice'} ${invoice.code} for order ${invoice.orderNo}`, exp && rate !== 1 ? `${exp.currency} ${round2(totals.payable)} @ ₹${rate}` : null, exp?.shippingBillNo ? `SB ${exp.shippingBillNo}` : null].filter(Boolean).join(' · '), entries, recordId: invoice.id })
      parties.set(invoice.customerName, { name: invoice.customerName, group: 'Sundry Debtors', gstin: invoice.customerGstin ?? null, state: stateFromGstin(invoice.customerGstin)?.name ?? invoice.placeOfSupply ?? null })
    }
  }

  if (want.has('receipts')) {
    const payments = await ctx.em.find(OrderPayment, { ...scope, voidedAt: null }, { orderBy: { paidOn: 'asc' } })
    const inRange = payments.filter((payment) => between(payment.paidOn, range.from, range.to))
    const orders = inRange.length ? await ctx.em.find(CcOrder, { id: { $in: [...new Set(inRange.map((payment) => payment.orderId))] } }) : []
    const customers = await loadCustomers(ctx, orders.map((order) => order.customerId))
    for (const payment of inRange) {
      const order = orders.find((entry) => entry.id === payment.orderId)
      const customer = order ? customers.get(order.customerId) : null
      const party = customer?.name ?? `Customer of ${payment.orderNo}`
      const amount = round2(Number(payment.amount))
      vouchers.push({
        type: 'Receipt',
        date: payment.paidOn,
        number: `RCPT-${payment.orderNo}-${payment.id.slice(0, 6)}`,
        reference: payment.reference ?? null,
        party,
        narration: [`${payment.kind === 'advance' ? 'Advance' : payment.kind === 'balance' ? 'Balance' : 'Payment'} for order ${payment.orderNo}`, payment.mode, payment.reference].filter(Boolean).join(' · '),
        entries: [
          { ledger: ledgers.bank, amount: -amount },
          { ledger: party, amount },
        ],
        recordId: payment.id,
      })
      if (!parties.has(party)) parties.set(party, { name: party, group: 'Sundry Debtors', gstin: customer?.gstin ?? null, state: stateFromGstin(customer?.gstin)?.name ?? null })
    }
  }

  if (want.has('purchases') || want.has('payments')) {
    const bills = await ctx.em.find(VendorBill, { ...scope, deletedAt: null, status: { $ne: 'cancelled' } }, { orderBy: { billDate: 'asc' } })
    const vendors = bills.length ? await ctx.em.find(Vendor, { id: { $in: [...new Set(bills.map((bill) => bill.vendorId))] } }) : []
    for (const bill of bills) {
      const vendor = vendors.find((entry) => entry.id === bill.vendorId)
      const vendorState = stateFromGstin(vendor?.gstNumber)?.code ?? null
      const party = bill.vendorName
      const used = want.has('purchases') && between(bill.billDate, range.from, range.to)
      if (used) {
        const taxable = round2(Number(bill.taxable))
        const gst = splitGst(Number(bill.gst), Boolean(homeState && vendorState && homeState !== vendorState))
        const total = round2(Number(bill.total))
        const entries: Entry[] = [{ ledger: ledgers.purchase, amount: -taxable }]
        if (gst.cgst) entries.push({ ledger: ledgers.inputCgst, amount: -gst.cgst })
        if (gst.sgst) entries.push({ ledger: ledgers.inputSgst, amount: -gst.sgst })
        if (gst.igst) entries.push({ ledger: ledgers.inputIgst, amount: -gst.igst })
        const difference = round2(total - taxable - gst.cgst - gst.sgst - gst.igst)
        if (difference) entries.push({ ledger: ledgers.roundOff, amount: -difference })
        entries.push({ ledger: party, amount: total })
        vouchers.push({ type: 'Purchase', date: bill.billDate, number: bill.code, reference: bill.billNo, party, narration: [`Bill ${bill.billNo}`, bill.grnCodes?.length ? `GRN ${bill.grnCodes.join(', ')}` : null, bill.poCode ? `PO ${bill.poCode}` : null].filter(Boolean).join(' · '), entries, recordId: bill.id })
      }
      let paidInRange = false
      if (want.has('payments')) {
        for (const payment of bill.payments ?? []) {
          if (payment.voidedAt) continue
          if (!between(payment.paidOn, range.from, range.to)) continue
          paidInRange = true
          const amount = round2(Number(payment.amount))
          vouchers.push({
            type: 'Payment',
            date: payment.paidOn,
            number: `PAY-${bill.code}-${payment.id.slice(0, 6)}`,
            reference: payment.reference ?? bill.billNo,
            party,
            narration: [`Payment against bill ${bill.billNo}`, payment.mode, payment.reference].filter(Boolean).join(' · '),
            entries: [
              { ledger: party, amount: -amount },
              { ledger: ledgers.bank, amount },
            ],
            recordId: bill.id,
          })
        }
      }
      if ((used || paidInRange) && !parties.has(party)) parties.set(party, { name: party, group: 'Sundry Creditors', gstin: vendor?.gstNumber ?? null, state: stateFromGstin(vendor?.gstNumber)?.name ?? null })
    }
    if (want.has('purchases')) {
      const notes = await ctx.em.find(DebitNote, { ...scope, deletedAt: null, status: 'issued' }, { orderBy: { noteDate: 'asc' } })
      for (const note of notes) {
        if (!between(note.noteDate, range.from, range.to)) continue
        const bill = bills.find((entry) => entry.id === note.vendorBillId)
        const vendor = vendors.find((entry) => entry.id === note.vendorId)
        const vendorState = stateFromGstin(vendor?.gstNumber)?.code ?? null
        const party = note.vendorName
        const taxable = round2(Number(note.taxable))
        const gst = splitGst(Number(note.gst), Boolean(homeState && vendorState && homeState !== vendorState))
        const total = round2(Number(note.total))
        const entries: Entry[] = [{ ledger: party, amount: -total }, { ledger: ledgers.purchase, amount: taxable }]
        if (gst.cgst) entries.push({ ledger: ledgers.inputCgst, amount: gst.cgst })
        if (gst.sgst) entries.push({ ledger: ledgers.inputSgst, amount: gst.sgst })
        if (gst.igst) entries.push({ ledger: ledgers.inputIgst, amount: gst.igst })
        const difference = round2(total - taxable - gst.cgst - gst.sgst - gst.igst)
        if (difference) entries.push({ ledger: ledgers.roundOff, amount: difference })
        vouchers.push({ type: 'Debit Note', date: note.noteDate, number: note.code, reference: bill?.billNo ?? note.billCode, party, narration: [`Debit note against bill ${bill?.billNo ?? note.billCode}`, note.reason].filter(Boolean).join(' · '), entries, recordId: note.id })
        if (!parties.has(party)) parties.set(party, { name: party, group: 'Sundry Creditors', gstin: vendor?.gstNumber ?? null, state: stateFromGstin(vendor?.gstNumber)?.name ?? null })
      }
    }
  }

  vouchers.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.number.localeCompare(b.number))
  return { companyName: company?.name ?? 'Company', vouchers, parties: [...parties.values()].sort((a, b) => a.name.localeCompare(b.name)) }
}

function xml(value: string | null | undefined): string {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function remoteIdOf(voucher: Pick<TallyVoucher, 'type' | 'number'>): string {
  return `CCCPL-${voucher.type.replace(/\s+/g, '')}-${voucher.number.replace(/[^A-Za-z0-9/_-]/g, '')}`
}

function ascii(value: string): string {
  return value.replace(/₹/g, 'Rs. ').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
}

function tallyAmount(value: number): string {
  return round2(value).toFixed(2)
}

export function tallyXml(data: Awaited<ReturnType<typeof tallyData>>, withMasters: boolean): string {
  const messages: string[] = []
  if (withMasters) {
    for (const party of data.parties) {
      messages.push(
        `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(party.name)}" ACTION="Create"><NAME.LIST><NAME>${xml(party.name)}</NAME></NAME.LIST><PARENT>${party.group}</PARENT><ISBILLWISEON>Yes</ISBILLWISEON>${party.gstin ? `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><PARTYGSTIN>${xml(party.gstin)}</PARTYGSTIN>` : '<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>'}${party.state ? `<LEDSTATENAME>${xml(party.state)}</LEDSTATENAME>` : ''}<COUNTRYNAME>India</COUNTRYNAME></LEDGER></TALLYMESSAGE>`,
      )
    }
  }
  for (const voucher of data.vouchers) {
    const lines = voucher.entries
      .map((entry) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(entry.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${entry.amount < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${tallyAmount(entry.amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>`)
      .join('')
    messages.push(
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${xml(remoteIdOf(voucher))}" VCHTYPE="${voucher.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${voucher.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${voucher.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(voucher.number)}</VOUCHERNUMBER>${voucher.reference ? `<REFERENCE>${xml(voucher.reference)}</REFERENCE>` : ''}<PARTYLEDGERNAME>${xml(voucher.party)}</PARTYLEDGERNAME><NARRATION>${xml(ascii(voucher.narration))}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${lines}</VOUCHER></TALLYMESSAGE>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(data.companyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${messages.join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function tallyCsv(data: Awaited<ReturnType<typeof tallyData>>): string {
  const rows: Array<Array<string | number>> = [['Date', 'Voucher type', 'Voucher no.', 'Reference', 'Party', 'Ledger', 'Debit', 'Credit', 'Narration']]
  for (const voucher of data.vouchers) {
    for (const entry of voucher.entries) {
      rows.push([voucher.date, voucher.type, voucher.number, voucher.reference ?? '', voucher.party, entry.ledger, entry.amount < 0 ? tallyAmount(-entry.amount) : '', entry.amount > 0 ? tallyAmount(entry.amount) : '', voucher.narration])
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}
