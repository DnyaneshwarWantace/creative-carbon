import type { BillDetails, BillParty } from '../data/entities'
import { COPY_LABELS, amountInWords, esc, hsnSummary, lines, money, partyLogoHtml, tallyDate, type CopyKind } from '../../cc_ui/lib/printKit'
import { letterheadOf } from '../lib/letterhead'
import type { CompanyView, InvoiceView, PiView } from './types'

export type TallyBillKind = 'pi' | 'invoice' | 'credit_note'

export type TallyBill = {
  kind: TallyBillKind
  code: string
  date: string
  interState: boolean
  status: string
  lines: Array<{ title: string; code?: string | null; hsn: string | null; quantity: number; unit?: string | null; rate: number | null; discountPercent: number; gstPercent: number; taxable: number; cgst?: number; sgst?: number; igst?: number }>
  totals: { taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; payable: number }
  bill: BillDetails
  againstCode?: string | null
  partyLogoUrl?: string | null
}

export const DEFAULT_COPIES: Record<TallyBillKind, CopyKind[]> = {
  pi: ['original'],
  invoice: ['original', 'duplicate', 'triplicate', 'extra'],
  credit_note: ['original', 'duplicate'],
}

const TITLE: Record<TallyBillKind, string> = { pi: 'Proforma Invoice', invoice: 'Tax Invoice', credit_note: 'Credit Note' }

function unitLabel(unit: string | null | undefined): string {
  const value = (unit ?? '').trim().toLowerCase()
  if (!value || value === 'kg' || value === 'kgs') return 'KG.'
  if (['pc', 'pcs', 'nos', 'no', 'piece', 'pieces'].includes(value)) return 'PCS'
  return value.toUpperCase()
}

function quantity(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function partyBlock(title: string, party: BillParty, placeOfSupply: string | null, logoUrl?: string | null): string {
  const row = (label: string, value: string | null) => (value ? `<tr><td class="pl">${label}</td><td>: ${esc(value)}</td></tr>` : '')
  const state = party.stateName ? `${party.stateName}${party.stateCode ? `, Code : ${party.stateCode}` : ''}` : null
  return `<div class="cell party"><div class="small">${title}</div>${partyLogoHtml(logoUrl)}<div class="pname">${esc(party.name)}</div>${party.address ? `<div class="paddr">${lines(party.address)}</div>` : ''}<table class="kv">${row('GSTIN/UIN', party.gstin)}${row('PAN/IT No', party.pan)}${row('State Name', state)}${placeOfSupply ? row('Place of Supply', placeOfSupply) : ''}${row('Contact', party.contact)}${row('E-Mail', party.email)}</table></div>`
}

function sellerBlock(company: CompanyView): string {
  const lh = letterheadOf(company.letterhead)
  const state = lh.stateName ? `State Name : ${esc(lh.stateName)}${lh.stateCode ? `, Code : ${esc(lh.stateCode)}` : ''}` : ''
  return `<div class="cell seller"><div class="sname">${esc((company.legalName || company.name).toUpperCase())}</div><div class="saddr">${lines((company.address ?? '').toUpperCase())}${lh.worksAddress ? `<br>${esc(lh.worksAddress.toUpperCase())}` : ''}${lh.udyam ? `<br>UDYAM : ${esc(lh.udyam)}` : ''}${company.gstin ? `<br>GSTIN/UIN: ${esc(company.gstin)}` : ''}${state ? `<br>${state}` : ''}${lh.cin ? `<br>CIN: ${esc(lh.cin)}` : ''}${company.email ? `<br>E-Mail : ${esc(company.email)}` : ''}</div></div>`
}

function infoCell(label: string, value: string | null | undefined, wide = false): string {
  return `<div class="ic${wide ? ' wide' : ''}"><div class="il">${label}</div><div class="iv">${esc(value ?? '')}</div></div>`
}

function infoGrid(doc: TallyBill): string {
  const bill = doc.bill
  const dated = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? tallyDate(value) : (value ?? ''))
  const reference = bill.referenceNo ? bill.referenceNo.replace(/(\d{4}-\d{2}-\d{2})/, (match) => tallyDate(match)) : ''
  return `<div class="info">${infoCell(doc.kind === 'credit_note' ? 'Credit Note No.' : 'Invoice No.', doc.code)}${infoCell('Dated', tallyDate(doc.date))}${infoCell('Delivery Note', bill.deliveryNote)}${infoCell('Mode/Terms of Payment', bill.paymentTerms)}${infoCell('Reference No. &amp; Date.', reference)}${infoCell('Other References', doc.kind === 'credit_note' && doc.againstCode ? `Against ${doc.againstCode}` : bill.otherReferences)}${infoCell('Buyer’s Order No.', bill.buyerOrderNo)}${infoCell('Dated', dated(bill.buyerOrderDate))}${infoCell('Dispatch Doc No.', bill.dispatchDocNo)}${infoCell('Delivery Note Date', dated(bill.deliveryNoteDate))}${infoCell('Dispatched through', bill.dispatchedThrough)}${infoCell('Destination', bill.destination)}<div class="ic wide tall"><div class="il">Terms of Delivery</div><div class="iv">${lines(bill.termsOfDelivery)}</div></div></div>`
}

function itemRows(doc: TallyBill): { rows: string; totalQty: string } {
  const notes = doc.bill.lineNotes ?? []
  const body = doc.lines
    .map((line, index) => {
      const per = unitLabel(line.unit)
      const note = notes[index]?.trim()
      return `<tr class="item"><td class="c">${index + 1}</td><td><div class="it">${esc(line.title.toUpperCase())}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</td><td class="c">${esc(line.hsn ?? '')}</td><td class="r b">${quantity(line.quantity)} ${per}</td><td class="r">${line.rate == null ? '' : money(line.rate)}</td><td class="c">${per}</td><td class="r">${line.discountPercent ? `${line.discountPercent} %` : ''}</td><td class="r b">${money(line.taxable)}</td></tr>`
    })
    .join('')
  const taxLine = (label: string, percent: number, amount: number) => `<tr class="tax"><td></td><td class="r tl">${label}</td><td></td><td></td><td class="r">${percent ? `${percent}` : ''}</td><td class="c">${percent ? '%' : ''}</td><td></td><td class="r b">${money(amount)}</td></tr>`
  const rates = [...new Set(doc.lines.map((line) => line.gstPercent))]
  const single = rates.length === 1 ? rates[0] : 0
  const taxes = doc.interState
    ? doc.totals.igst
      ? taxLine(`OUTPUT IGST - ${single || ''}${single ? '%' : ''}`.replace(/ - $/, ''), single, doc.totals.igst)
      : ''
    : `${doc.totals.cgst ? taxLine(`OUTPUT CGST - ${single ? single / 2 : ''}%`, single / 2, doc.totals.cgst) : ''}${doc.totals.sgst ? taxLine(`OUTPUT SGST - ${single ? single / 2 : ''}%`, single / 2, doc.totals.sgst) : ''}`
  const subtotal = `<tr class="sub"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="r b st">${money(round(doc.totals.taxable))}</td></tr>`
  const roundOff = doc.totals.roundOff ? `<tr class="tax"><td></td><td class="r tl">ROUND OFF</td><td></td><td></td><td></td><td></td><td></td><td class="r b">${money(doc.totals.roundOff)}</td></tr>` : ''
  const units = [...new Set(doc.lines.map((line) => unitLabel(line.unit)))]
  const totalQty = units.length === 1 ? `${quantity(doc.lines.reduce((sum, line) => sum + line.quantity, 0))} ${units[0]}` : ''
  return { rows: `${body}${subtotal}${taxes}${roundOff}<tr class="fill"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`, totalQty }
}

function hsnTable(doc: TallyBill): string {
  const rows = hsnSummary(
    doc.lines.map((line) => ({ hsn: line.hsn, taxable: line.taxable, gstPercent: line.gstPercent, cgst: line.cgst, sgst: line.sgst, igst: line.igst })),
    doc.interState,
  )
  const head = doc.interState
    ? '<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable<br>Value</th><th colspan="2">IGST</th><th rowspan="2">Total<br>Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th></tr>'
    : '<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable<br>Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th rowspan="2">Total<br>Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>'
  const body = rows
    .map((row) => (doc.interState ? `<tr><td>${esc(row.hsn)}</td><td class="r">${money(row.taxable)}</td><td class="r">${row.rate}%</td><td class="r">${money(row.igst)}</td><td class="r">${money(row.tax)}</td></tr>` : `<tr><td>${esc(row.hsn)}</td><td class="r">${money(row.taxable)}</td><td class="r">${row.rate / 2}%</td><td class="r">${money(row.cgst)}</td><td class="r">${row.rate / 2}%</td><td class="r">${money(row.sgst)}</td><td class="r">${money(row.tax)}</td></tr>`))
    .join('')
  const sum = (pick: (row: (typeof rows)[number]) => number) => money(round(rows.reduce((total, row) => total + pick(row), 0)))
  const total = doc.interState
    ? `<tr class="b"><td class="r">Total:</td><td class="r">${sum((row) => row.taxable)}</td><td></td><td class="r">${sum((row) => row.igst)}</td><td class="r">${sum((row) => row.tax)}</td></tr>`
    : `<tr class="b"><td class="r">Total:</td><td class="r">${sum((row) => row.taxable)}</td><td></td><td class="r">${sum((row) => row.cgst)}</td><td></td><td class="r">${sum((row) => row.sgst)}</td><td class="r">${sum((row) => row.tax)}</td></tr>`
  const tax = round(rows.reduce((totalTax, row) => totalTax + row.tax, 0))
  return `<table class="hsn">${head}${body}${total}</table><div class="tw">Tax Amount (in words) : <b>${esc(amountInWords(tax))}</b></div>`
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10.5px}
.page{width:200mm;margin:0 auto;padding:6mm 0 4mm;page-break-after:always;position:relative}
.page:last-child{page-break-after:auto}
.top{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;margin-bottom:3px}
.top .t{font-size:13px;text-align:center;grid-column:2}
.top .copy{font-size:10px;text-align:right}
.top .copy span{margin-left:40px}
.einv{display:grid;grid-template-columns:1fr auto;align-items:start;margin:6px 0 10px}
.einv table td{padding:0 4px 1px 0;vertical-align:top;font-size:10.5px}
.einv img{width:118px;height:118px}
.box{border:1px solid #000}
.head{display:grid;grid-template-columns:55% 45%}
.left{border-right:1px solid #000}
.cell{padding:3px 4px;border-bottom:1px solid #000}
.cell:last-child{border-bottom:0}
.sname{font-weight:700;font-size:10.5px}
.saddr{font-size:9.5px;line-height:1.25}
.small{font-size:9.5px}
.pname{font-weight:700;font-size:11.5px}
.paddr{font-size:10.5px;line-height:1.25}
.kv td{padding:0;font-size:10.5px;vertical-align:top}
.kv .pl{width:92px}
.info{display:grid;grid-template-columns:1fr 1fr}
.ic{border-bottom:1px solid #000;padding:2px 4px;min-height:30px}
.ic:nth-child(odd){border-right:1px solid #000}
.ic.wide{grid-column:1/3;border-right:0;border-bottom:0}
.ic.tall{min-height:60px}
.il{font-size:9.5px}
.iv{font-weight:700;font-size:10.5px}
table.items{width:100%;border-collapse:collapse;border-top:1px solid #000}
table.items th{font-weight:400;font-size:9.5px;border-bottom:1px solid #000;border-right:1px solid #000;padding:3px 2px;text-align:center}
table.items td{border-right:1px solid #000;padding:2px 4px;vertical-align:top}
table.items th:last-child,table.items td:last-child{border-right:0}
table.items .it{font-weight:700;font-size:11px}
table.items .note{padding-left:14px;font-size:10px}
table.items tr.fill td{height:var(--fill,140px)}
table.items tr.total td{border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 4px}
table.items .st{border-top:1px solid #000}
.c{text-align:center}.r{text-align:right}.b{font-weight:700}
.tl{padding-right:12px!important}
.words{display:flex;justify-content:space-between;padding:3px 4px 0}
.wv{padding:0 4px 4px;font-weight:700;font-size:11.5px}
table.hsn{width:100%;border-collapse:collapse;border-top:1px solid #000;font-size:9.5px}
table.hsn th,table.hsn td{border-right:1px solid #000;border-bottom:1px solid #000;padding:1px 4px;font-weight:400}
table.hsn th:last-child,table.hsn td:last-child{border-right:0}
.tw{padding:4px 4px 2px}
.rem{padding:4px 4px 0;font-size:10.5px}
.foot{display:grid;grid-template-columns:50% 50%;padding:0 4px 4px;gap:6px}
.decl{font-size:10px;line-height:1.3}
.decl u{display:block;margin-top:4px}
.bank td{font-size:10.5px;padding:0 4px 0 0;vertical-align:top}
.sign{border-top:1px solid #000;border-left:1px solid #000;margin-top:4px;text-align:right;padding:3px 4px;min-height:64px;display:flex;flex-direction:column;justify-content:space-between}
.sign .dsig{font-size:7.5px}
.sign img{max-height:40px;align-self:flex-end}
.gen{text-align:center;font-size:10px;margin-top:6px}
.wm{position:absolute;top:45%;left:0;right:0;text-align:center;font-size:90px;font-weight:800;color:rgba(0,0,0,.08);transform:rotate(-20deg);pointer-events:none}
@media print{@page{size:A4;margin:6mm}.page{padding-top:0}}
`

export function buildTallyBillHtml(doc: TallyBill, company: CompanyView, copies: CopyKind[], qrDataUrl: string | null, forPrint = true): string {
  const lh = letterheadOf(company.letterhead)
  const { rows, totalQty } = itemRows(doc)
  const fill = Math.max(40, 240 - doc.lines.length * 34 - (doc.bill.lineNotes ?? []).filter(Boolean).length * 12)
  const legal = (company.legalName || company.name).toUpperCase()
  const bankRows = [
    ["A/c Holder's Name", legal],
    ['Bank Name', lh.bankLabel || company.bankName],
    ['A/c No.', company.bankAccount],
    ['Branch &amp; IFS Code', [company.bankBranch, company.bankIfsc].filter(Boolean).join(' & ')],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><td>${label}</td><td>: ${esc(value)}</td></tr>`)
    .join('')
  const signedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')
  const watermark = doc.status === 'cancelled' ? '<div class="wm">CANCELLED</div>' : doc.status === 'draft' ? '<div class="wm">DRAFT</div>' : ''
  const einvoice = doc.kind !== 'pi' && doc.bill.irn
  const page = (copy: CopyKind) => `<div class="page">${watermark}
  <div class="top"><div></div><div class="t">${TITLE[doc.kind]}</div><div class="copy">(${COPY_LABELS[copy]})${einvoice ? '<span>e-Invoice</span>' : ''}</div></div>
  ${einvoice ? `<div class="einv"><table><tr><td>IRN</td><td>: ${esc(doc.bill.irn)}</td></tr><tr><td>Ack No.</td><td>: ${esc(doc.bill.ackNo ?? '')}</td></tr><tr><td>Ack Date</td><td>: ${esc(doc.bill.ackDate && /^\d{4}-\d{2}-\d{2}/.test(doc.bill.ackDate) ? tallyDate(doc.bill.ackDate) : (doc.bill.ackDate ?? ''))}</td></tr></table>${qrDataUrl ? `<img src="${qrDataUrl}" alt="e-Invoice QR">` : ''}</div>` : ''}
  <div class="box">
    <div class="head">
      <div class="left">${sellerBlock(company)}${partyBlock('Consignee (Ship to)', doc.bill.consignee, null)}${partyBlock('Buyer (Bill to)', doc.bill.buyer, doc.bill.placeOfSupply, doc.partyLogoUrl)}</div>
      ${infoGrid(doc)}
    </div>
    <table class="items" style="--fill:${fill}px">
      <colgroup><col style="width:5%"><col style="width:42%"><col style="width:10%"><col style="width:11%"><col style="width:9%"><col style="width:5%"><col style="width:6%"><col style="width:12%"></colgroup>
      <thead><tr><th>Sl<br>No.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Disc. %</th><th>Amount</th></tr></thead>
      <tbody>${rows}<tr class="total"><td></td><td class="r">Total</td><td></td><td class="r b">${totalQty}</td><td></td><td></td><td></td><td class="r b">₹ ${money(doc.totals.payable)}</td></tr></tbody>
    </table>
    <div class="words"><span>Amount Chargeable (in words)</span><span>E. &amp; O.E</span></div>
    <div class="wv">${esc(amountInWords(doc.totals.payable))}</div>
    ${doc.kind === 'pi' ? hsnTable(doc) : ''}
    ${doc.bill.remarks ? `<div class="rem">Remarks:<br><b>${lines(doc.bill.remarks)}</b></div>` : ''}
    <div class="rem">Company’s PAN &nbsp;&nbsp;&nbsp;&nbsp;: <b>${esc(company.pan ?? '')}</b></div>
    <div class="foot">
      <div class="decl"><u>Declaration</u>${lines(lh.declaration)}</div>
      <div><div>Company’s Bank Details</div><table class="bank">${bankRows}</table>
        <div class="sign"><b>for ${esc(legal)}</b>${lh.signatureUrl ? `<img src="${esc(lh.signatureUrl)}" alt="Signature">` : ''}${company.signatory ? `<div class="dsig">${esc(company.signatory.toUpperCase())}<br>Digitally signed on ${esc(signedAt)}</div>` : ''}<div>Authorised Signatory</div></div>
      </div>
    </div>
  </div>
  <div class="gen">This is a Computer Generated ${doc.kind === 'credit_note' ? 'Document' : 'Invoice'}</div>
  </div>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${TITLE[doc.kind]} ${esc(doc.code)}</title><style>${CSS}</style></head><body>${copies.map(page).join('')}${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>" : "<script>function fit(){var page=document.querySelector('.page');if(!page)return;document.body.style.zoom='';var scale=Math.min(1,(window.innerWidth-12)/page.offsetWidth);document.body.style.zoom=String(scale)}window.addEventListener('load',fit);window.addEventListener('resize',fit)</script>"}</body></html>`
}

export function tallyBillFromInvoice(doc: InvoiceView & { billDetails: BillDetails }): TallyBill {
  return {
    kind: doc.kind === 'credit_note' ? 'credit_note' : 'invoice',
    code: doc.code,
    date: doc.invoiceDate,
    interState: doc.interState,
    status: doc.status,
    lines: doc.lines,
    totals: doc.totals,
    bill: doc.billDetails,
    againstCode: doc.againstCode,
    partyLogoUrl: doc.partyLogoUrl,
  }
}

export function tallyBillFromPi(pi: PiView & { billDetails: BillDetails }, interState: boolean): TallyBill {
  const igst = interState ? pi.totals.gst : 0
  const half = interState ? 0 : round(pi.totals.gst / 2)
  return {
    kind: 'pi',
    code: pi.code,
    date: pi.piDate,
    interState,
    status: pi.status === 'cancelled' ? 'cancelled' : 'issued',
    lines: pi.lines.map((line) => ({ ...line, igst: interState ? line.gst : 0, cgst: interState ? 0 : line.gst / 2, sgst: interState ? 0 : line.gst / 2 })),
    totals: { taxable: pi.totals.taxable, igst, cgst: half, sgst: interState ? 0 : round(pi.totals.gst - half), roundOff: round(Math.round(pi.totals.total) - pi.totals.total), payable: Math.round(pi.totals.total) },
    bill: pi.billDetails,
    partyLogoUrl: pi.partyLogoUrl,
  }
}

export async function qrImage(signedQr: string | null | undefined): Promise<string | null> {
  if (!signedQr) return null
  try {
    const QRCode = await import('qrcode')
    return await QRCode.toDataURL(signedQr, { errorCorrectionLevel: 'M', margin: 0, width: 240 })
  } catch {
    return null
  }
}

export async function printTallyBill(doc: TallyBill, company: CompanyView, copies: CopyKind[]): Promise<boolean> {
  const popup = window.open('', '_blank', 'width=1000,height=1100')
  if (!popup) return false
  const qr = doc.kind === 'pi' ? null : await qrImage(doc.bill.signedQr)
  popup.document.open()
  popup.document.write(buildTallyBillHtml(doc, company, copies, qr))
  popup.document.close()
  return true
}
