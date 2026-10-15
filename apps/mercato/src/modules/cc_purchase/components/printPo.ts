import type { PoView } from './shared'
import { LETTERHEAD_CSS, letterheadHtml, letterheadOf, partyLogoHtml, type PrintCompany } from '../../cc_ui/lib/printKit'
import { PO_FORM_NO, PO_PRINT_TERMS } from '../lib/printTerms'
import { REVISION_CSS, revisionTag, supersededBlock, type RevisionPrint } from '../../cc_ui/lib/printRevision'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function plain(value: number): string {
  return value.toFixed(2)
}

function dotDay(value: string | null): string {
  if (!value) return ''
  const [year, month, dayOfMonth] = value.slice(0, 10).split('-')
  return `${dayOfMonth}.${month}.${year}`
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>')
}

export function buildPurchaseOrderHtml(po: PoView & RevisionPrint, company?: PrintCompany | null, forPrint = true): string {
  const lh = letterheadOf(company)
  const terms = po.printTerms ?? {}
  const deliveryPlace = terms.deliveryPlace || ''
  const upper = (value: string | null | undefined) => (value ?? '').toUpperCase()
  const units = [...new Set(po.lines.map((line) => upper(line.unit)))]
  const per = units.length === 1 ? `(@)${units[0] === 'KG' ? 'KGS' : units[0]}` : ''
  const rows = po.lines
    .map((line, index) => `<tr><td class="c">${index + 1}</td><td class="c b">${escapeHtml(upper(line.title))}${line.notes ? `<br><span class="sm">${escapeHtml(upper(line.notes))}</span>` : ''}</td><td class="c b">${escapeHtml(upper(line.unit))}</td><td class="c b">${plain(line.rate)}</td><td class="c b">${money(line.quantity).replace(/\.00$/, '')}<br>${escapeHtml(upper(line.unit) === 'KG' ? 'KGS' : upper(line.unit))}</td><td class="c b">${plain(line.amount)}</td></tr>`)
    .join('')
  const blank = Array.from({ length: Math.max(1, 9 - po.lines.length) }, () => '<tr class="bl"><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')
  const instructions = (terms.specialInstruction ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<tr><td class="c b">#</td><td colspan="5" class="b">${escapeHtml(line.toUpperCase())}</td></tr>`)
    .join('')
  const termLine = (label: string, value: string | null | undefined) => (value ? `<div><b>${label}</b> ${escapeHtml(upper(value))}</div>` : '')
  const directors = (lh.directors ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
  const signTitle = directors[0]?.split(',')[1]?.trim() || 'Director'
  const draft = po.status === 'draft' || po.status === 'pending_approval'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(po.code)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
    .page{width:194mm;margin:0 auto;padding:8mm 0;position:relative}
    ${LETTERHEAD_CSS}
    ${REVISION_CSS}
    table.po{width:100%;border-collapse:collapse;border:1.5px solid #222;margin-top:14px}
    table.po td,table.po th{border:1px solid #222;padding:3px 6px;vertical-align:top}
    table.po th{font-weight:700;font-size:11.5px}
    .c{text-align:center}.r{text-align:right}.b{font-weight:700}.sm{font-size:10.5px}
    tr.bl td{height:20px;border-top:0;border-bottom:0}
    .ttl{font-weight:700;letter-spacing:.04em}
    .plogo{margin:2px 0 4px}
    .terms{display:grid;grid-template-columns:1fr auto;margin-top:22px;align-items:end}
    .terms .hd{font-weight:700;text-decoration:underline;margin-bottom:8px}
    .terms div{margin:3px 0 3px 16px;font-size:12.5px}
    .sig{text-align:center;font-weight:700}
    .sig img{max-height:70px;display:block;margin:6px auto}
    .war{margin-top:18px;font-size:10.5px;font-weight:700}
    .wm{position:absolute;top:40%;left:0;right:0;text-align:center;font-size:80px;color:rgba(0,0,0,.06);transform:rotate(-20deg);font-weight:800}
    @media print{@page{size:A4;margin:8mm}.page{padding:0}}
  </style></head><body><div class="page">${supersededBlock(po)}${draft ? '<div class="wm">NOT APPROVED</div>' : ''}
  ${letterheadHtml(company)}
  <table class="po">
    <colgroup><col style="width:7%"><col style="width:40%"><col style="width:9%"><col style="width:13%"><col style="width:13%"><col style="width:18%"></colgroup>
    <tr><td colspan="2" class="b">TO-:</td><td colspan="2" class="c ttl">PURCHASE ORDER</td><td colspan="2" class="r b">${escapeHtml(PO_FORM_NO)}</td></tr>
    <tr><td colspan="3" class="b">${partyLogoHtml(po.partyLogoUrl)}${escapeHtml(upper(po.vendorName))}${po.vendorAddress ? `<br><span style="margin-left:40px">${multiline(upper(po.vendorAddress))}</span>` : ''}${po.vendorGstin ? `<br><span class="sm">GSTIN: ${escapeHtml(po.vendorGstin)}</span>` : ''}</td><td colspan="3" class="b">P.O NO- ${escapeHtml(po.code)}${revisionTag(po)}<br><br>DATE- ${dotDay(po.poDate)}${po.expectedDate ? `<br><span class="sm">DELIVER BY ${dotDay(po.expectedDate)}</span>` : ''}</td></tr>
    <tr><td colspan="6" class="c b" style="font-size:13px">OUR GST NO: ${escapeHtml(company?.gstin ?? '')}</td></tr>
    <tr><th>SR.N</th><th>ITEM NAME</th><th>UNIT</th><th>RATE PER<br>${per}</th><th>QTY</th><th>AMOUNT</th></tr>
    ${rows}${blank}
    <tr><td></td><td></td><td></td><td></td><td class="b">BASIC AMT</td><td class="c b">${plain(po.subtotal)}</td></tr>
    ${instructions}
    <tr><td colspan="4" class="c b"><u>${deliveryPlace ? `DELIVERY - ${escapeHtml(upper(deliveryPlace))}` : ''}</u></td><td class="b">TOTAL .RS :-</td><td class="c b">${plain(po.subtotal)}</td></tr>
  </table>
  <div class="terms">
    <div><div class="hd">TERMS &amp; CONDITION-:</div>${termLine('TAXES-;', terms.taxes)}${termLine('P&amp;F-:', terms.packingForwarding)}${termLine('DELIVERY -', terms.delivery)}${termLine('THROUGH-:', terms.through)}${termLine('PAYMENT-:', terms.payment || po.terms)}${po.notes ? termLine('NOTE-:', po.notes) : ''}</div>
    <div class="sig">Yours Faithfully<br>For,${escapeHtml(upper(company?.name || 'Creative Carbon Composites Pvt. Ltd.'))}${lh.stampUrl ? `<img src="${escapeHtml(lh.stampUrl)}" alt="Stamp">` : lh.signatureUrl ? `<img src="${escapeHtml(lh.signatureUrl)}" alt="Signature">` : '<div style="height:60px"></div>'}${escapeHtml(signTitle)}</div>
  </div>
  ${terms.guarantee ? `<div class="war">GAURANTY/WARRANTY-: ${escapeHtml(upper(terms.guarantee))}</div>` : ''}
  </div>${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>" : ''}
  </body></html>`
}

export function printPurchaseOrder(po: PoView & RevisionPrint, company?: PrintCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildPurchaseOrderHtml(po, company))
  popup.document.close()
  return true
}
