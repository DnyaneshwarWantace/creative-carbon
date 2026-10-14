import type { PoView } from './shared'
import { REVISION_CSS, revisionTag, supersededBlock, type RevisionPrint } from '../../cc_ui/lib/printRevision'
import { LETTERHEAD_CSS, letterheadHtml, letterheadOf, lines as multiline, type PrintCompany } from '../../cc_ui/lib/printKit'
import { peopleList } from '../../cc_accounts/lib/letterhead'
import { TC_INSTRUCTION } from '../lib/poPrint'

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

export function buildPoLetterHtml(po: PoView & RevisionPrint, company: PrintCompany | null | undefined, forPrint = true): string {
  const print = po.printDetails
  if (!print) return buildPurchaseOrderHtml(po)
  const lh = letterheadOf(company)
  const signer = peopleList(lh.directors)[0] ?? ''
  const signTitle = signer.split(',')[1]?.trim() || 'Director'
  const units = [...new Set(po.lines.map((line) => line.unit.toUpperCase()))]
  const per = units.length === 1 ? `(@)${units[0] === 'KG' ? 'KGS' : units[0]}` : ''
  const rows = po.lines
    .map((line, index) => `<tr><td class="c">${index + 1}</td><td class="c b">${escapeHtml(line.title.toUpperCase())}${line.notes ? `<br><span class="sm">${escapeHtml(line.notes.toUpperCase())}</span>` : ''}</td><td class="c b">${escapeHtml(line.unit.toUpperCase())}</td><td class="c b">${plain(line.rate)}</td><td class="c b">${money(line.quantity).replace(/\.00$/, '')}<br>${escapeHtml(line.unit.toUpperCase() === 'KG' ? 'KGS' : line.unit.toUpperCase())}</td><td class="c b">${plain(line.amount)}</td></tr>`)
    .join('')
  const blank = Array.from({ length: Math.max(1, 9 - po.lines.length) }, () => '<tr class="bl"><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')
  const instructions = [print.needsTc && !print.instructions.toUpperCase().includes('TEST CERTIFICATE') ? TC_INSTRUCTION : '', ...print.instructions.split('\n')].map((line) => line.trim()).filter(Boolean)
  const instructionRows = instructions.map((line) => `<tr><td class="c b">#</td><td colspan="5" class="b">${escapeHtml(line.toUpperCase())}</td></tr>`).join('')
  const term = (label: string, value: string) => (value ? `<div><b>${label}</b> ${escapeHtml(value.toUpperCase())}</div>` : '')
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
    <tr><td colspan="2" class="b">TO-:</td><td colspan="2" class="c ttl">PURCHASE ORDER</td><td colspan="2" class="r b">${escapeHtml(print.formNo)}</td></tr>
    <tr><td colspan="3" class="b">${escapeHtml(po.vendorName.toUpperCase())}${po.vendorAddress ? `<br><span style="margin-left:40px">${multiline(po.vendorAddress.toUpperCase())}</span>` : ''}</td><td colspan="3" class="b">P.O NO- ${escapeHtml(po.code)}${revisionTag(po)}<br><br>DATE- ${dotDay(po.poDate)}</td></tr>
    <tr><td colspan="6" class="c b" style="font-size:13px">OUR GST NO: ${escapeHtml(company?.gstin ?? '')}</td></tr>
    <tr><th>SR.N</th><th>ITEM NAME</th><th>UNIT</th><th>RATE PER<br>${per}</th><th>QTY</th><th>AMOUNT</th></tr>
    ${rows}${blank}
    <tr><td></td><td></td><td></td><td></td><td class="b">BASIC AMT</td><td class="c b">${plain(po.subtotal)}</td></tr>
    ${instructionRows}
    <tr><td colspan="4" class="c b"><u>${print.deliverAt ? `DELIVERY - ${escapeHtml(print.deliverAt.toUpperCase())}` : ''}</u></td><td class="b">TOTAL .RS :-</td><td class="c b">${plain(po.subtotal)}</td></tr>
  </table>
  <div class="terms">
    <div><div class="hd">TERMS &amp; CONDITION-:</div>${term('TAXES-;', print.taxes)}${term('P&amp;F-:', print.packing)}${term('DELIVERY -', print.delivery)}${term('THROUGH-:', print.through)}${term('PAYMENT-:', print.payment)}</div>
    <div class="sig">Yours Faithfully<br>For,${escapeHtml((company?.name ?? '').toUpperCase())}${lh.stampUrl ? `<img src="${escapeHtml(lh.stampUrl)}" alt="Stamp">` : lh.signatureUrl ? `<img src="${escapeHtml(lh.signatureUrl)}" alt="Signature">` : '<div style="height:60px"></div>'}${escapeHtml(signTitle)}</div>
  </div>
  ${print.warranty ? `<div class="war">GAURANTY/WARRANTY-: ${escapeHtml(print.warranty.toUpperCase())}</div>` : ''}
  </div>${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>" : "<script>function fit(){var page=document.querySelector('.page');if(!page)return;document.body.style.zoom='';document.body.style.zoom=String(Math.min(1,(window.innerWidth-12)/page.offsetWidth))}window.addEventListener('load',fit);window.addEventListener('resize',fit)</script>"}
  </body></html>`
}

export function buildPurchaseOrderHtml(po: PoView & RevisionPrint): string {
  const rows = po.lines
    .map(
      (line, index) => `<tr>
        <td class="n">${index + 1}</td>
        <td><strong>${escapeHtml(line.title)}</strong>${line.code ? `<div class="code">${escapeHtml(line.code)}</div>` : ''}</td>
        <td class="r">${money(line.quantity).replace(/\.00$/, '')} ${escapeHtml(line.unit)}</td>
        <td class="r">${money(line.rate)}</td>
        <td class="r">${line.gstPercent}%</td>
        <td class="r">${money(line.amount)}</td>
      </tr>`,
    )
    .join('')
  const draft = po.status === 'draft' || po.status === 'pending_approval'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(po.code)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0;letter-spacing:.02em} .muted{color:#78716c} .code{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#78716c}
    ${REVISION_CSS}
    .doc{text-align:right} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:24px;color:#78716c}
    .totals{margin-left:auto;width:260px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:3px 0} .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px}
    .terms{margin-top:22px} .sign{display:flex;justify-content:space-between;margin-top:48px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    .wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90px;color:rgba(0,0,0,.06);transform:rotate(-20deg);font-weight:800}
    @media print{body{padding:16mm}}
  </style></head><body>${supersededBlock(po)}
  ${draft ? '<div class="wm">NOT APPROVED</div>' : ''}
  <div class="top">
    <div><h1>CREATIVE CARBON</h1><div class="muted">Purchase order</div></div>
    <div class="doc"><div class="no">${escapeHtml(po.code)}${revisionTag(po)}</div><div class="muted">Date ${day(po.poDate)}</div>${po.expectedDate ? `<div class="muted">Deliver by ${day(po.expectedDate)}</div>` : ''}</div>
  </div>
  <div class="grid">
    <div class="box"><h3>Vendor</h3><strong>${escapeHtml(po.vendorName)}</strong><div class="code">GSTIN ${escapeHtml(po.vendorGstin ?? '—')}</div></div>
    <div class="box"><h3>Deliver to</h3><strong>Creative Carbon Composites</strong><div class="muted">RM / PM store</div>${po.orderRefs.length ? `<div class="code">Ref ${po.orderRefs.map((ref) => escapeHtml(ref.orderNo)).join(', ')}</div>` : ''}</div>
  </div>
  <table><thead><tr><th>#</th><th>Material</th><th class="r">Quantity</th><th class="r">Rate ₹</th><th class="r">GST</th><th class="r">Amount ₹</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals"><div><span>Before GST</span><span>₹ ${money(po.subtotal)}</span></div><div><span>GST</span><span>₹ ${money(po.gst)}</span></div><div class="grand"><span>Total</span><span>₹ ${money(po.total)}</span></div></div>
  ${po.terms || po.notes ? `<div class="terms">${po.terms ? `<div><strong>Payment terms:</strong> ${escapeHtml(po.terms)}</div>` : ''}${po.notes ? `<div><strong>Notes:</strong> ${escapeHtml(po.notes)}</div>` : ''}</div>` : ''}
  <div class="sign"><div>Prepared by ${escapeHtml(po.createdByName ?? '')}</div><div>Approved by ${escapeHtml(po.approvedByName ?? '')}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

export function printPurchaseOrder(po: PoView & RevisionPrint, company?: PrintCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(po.printDetails && company ? buildPoLetterHtml(po, company) : buildPurchaseOrderHtml(po))
  popup.document.close()
  return true
}
