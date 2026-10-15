import { companyHeader, type DocCompany } from '../../cc_orders/components/printDocs'
import type { Quotation } from './types'
import { REVISION_CSS, revisionTag, supersededBlock, type RevisionPrint } from '../../cc_ui/lib/printRevision'
import { LETTERHEAD_CSS, letterheadHtml, letterheadOf, lines as multiline, partyLogoHtml, type PrintCompany } from '../../cc_ui/lib/printKit'
import { peopleList } from '../../cc_accounts/lib/letterhead'
import type { QuoteLetter } from '../lib/quoteLetter'

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function num(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function day(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function typedRate(value: number | null | undefined): string {
  if (value == null) return ''
  const [whole, paise] = value.toFixed(2).split('.')
  return `${whole}=${paise}`
}

function dashDate(value: string | null | undefined): string {
  if (!value) return ''
  const [year, month, dayOfMonth] = value.slice(0, 10).split('-')
  return `${dayOfMonth}-${month}-${year}`
}

export function buildQuotationLetterHtml(quote: Quotation & RevisionPrint & { letter: QuoteLetter }, company: PrintCompany | null | undefined, forPrint = true): string {
  const letter = quote.letter
  const lh = letterheadOf(company)
  const signer = peopleList(lh.directors)[0] ?? company?.signatory ?? ''
  const [signName, signTitle] = signer.split(',').map((part) => part.trim())
  const toLines = [letter.toDesignation, letter.toCompany, ...letter.toAddress.split('\n')].map((line) => line.trim()).filter(Boolean)
  while (toLines.length < 4) toLines.push('')
  const rows = quote.lines
    .map((line, index) => {
      const extra = letter.lines[index] ?? { drawing: '', unit: '', ratePer: '' }
      const qtyText = `${num(line.quantity)} ${esc(extra.unit || (line.product?.unit === 'nos' ? 'NOS' : 'KG'))}${extra.unit === 'NOS' && quote.lines.length > 1 && index > 0 ? '.' : ''}`
      return `<tr><td class="c">${index + 1}</td><td><div class="d">${esc((line.product?.title ?? '').toUpperCase())}</div>${extra.drawing ? `<div class="d">${esc(extra.drawing.toUpperCase())}</div>` : ''}</td><td class="c b">${qtyText}</td><td class="c b">${esc(extra.ratePer || 'EACH')}</td><td class="c b">${typedRate(line.rate)}</td></tr>`
    })
    .join('')
  const blank = Array.from({ length: Math.max(0, 6 - quote.lines.length) }, () => '<tr class="blank"><td></td><td></td><td></td><td></td><td></td></tr>').join('')
  const sums = quote.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const total = letter.showTotal ? `<tr class="tot"><td></td><td class="r b">TOTAL (before tax)</td><td></td><td></td><td class="c b">${typedRate(sums.taxable)}</td></tr>` : ''
  const term = (label: string, value: string) => (value ? `<tr><td class="tk">${label}</td><td class="tc">:</td><td>${esc(value)}</td></tr>` : '')
  const type = letter.quoteType === 'firm' ? 'FIRM' : 'BUDGETARY'
  const bankLine = [company?.bankName, company?.bankBranch].filter(Boolean).join(', ')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Quotation ${esc(quote.quoteNo)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
    .page{width:194mm;margin:0 auto;padding:8mm 0}
    ${LETTERHEAD_CSS}
    ${REVISION_CSS}
    h1.qt{font-family:'Arial Black','Impact','Helvetica Neue',sans-serif;font-weight:900;font-size:34px;letter-spacing:4px;text-align:center;margin:18px 0 6px;color:#111;text-shadow:1px 1px 0 #fff,2px 2px 0 #555}
    .refrow{display:flex;justify-content:space-between;font-weight:700;margin:10px 0 14px}
    .to{margin-left:52px;font-weight:700}
    .to .ln{border-bottom:1px solid #222;min-height:18px;padding:1px 0;font-size:12.5px}
    .attn{display:flex;gap:18px;margin:14px 0 10px;font-weight:700}
    .attn .v{flex:1;border-bottom:1px solid #222;text-align:center}
    .lead{font-weight:700;margin:4px 0 2px 64px}
    table.items{width:100%;border-collapse:collapse;border:1px solid #222;margin-top:4px}
    table.items th{border:1px solid #222;font-size:11px;padding:3px}
    table.items td{border-left:1px solid #222;border-right:1px solid #222;padding:3px 5px;vertical-align:top}
    table.items tr.blank td{height:20px}
    .d{font-weight:700;font-size:11.5px}
    .c{text-align:center}.r{text-align:right}.b{font-weight:700}
    .terms{margin-top:6px;border:1px solid #222}
    .terms .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #222}
    .terms .hd .t{font-family:'Arial Black','Impact',sans-serif;font-weight:900;font-size:15px;letter-spacing:2px;padding:2px 8px;border-right:1px solid #222}
    .terms .hd .g{font-size:10.5px;font-weight:700;padding:2px 10px}
    .terms .ex{font-size:9.5px;font-weight:700;text-decoration:underline;padding:3px 8px}
    .terms table{margin:4px 0 8px 60px;font-weight:700}
    .terms td{padding:2px 4px}.tk{min-width:90px;text-align:right}.tc{width:18px;text-align:center}
    .foot{border:1px solid #222;border-top:0;padding:4px 8px;display:grid;grid-template-columns:1fr auto;gap:12px;font-weight:700;font-size:11.5px}
    .foot .sig{text-align:center;align-self:end;min-width:150px}
    .foot .sig img{max-height:56px;display:block;margin:0 auto}
    .sister{border:1px solid #222;border-top:0;padding:3px 8px;font-weight:700;font-size:11px}
    @media print{@page{size:A4;margin:8mm}.page{padding:0}}
  </style></head><body><div class="page">${supersededBlock(quote)}
  ${letterheadHtml(company)}
  <h1 class="qt">QUOTATION</h1>
  <div class="refrow"><span>REF.NO: ${esc(quote.quoteNo)}${revisionTag(quote)}</span><span>DATE:- ${dashDate(quote.quoteDate)}</span></div>
  <div class="b">TO,</div>
  <div class="to">${partyLogoHtml(quote.partyLogoUrl)}${toLines.map((line) => `<div class="ln">${esc(line)}</div>`).join('')}</div>
  <div class="attn"><span>Dear Sir,</span><span class="v">${letter.kindAttn ? `KIND ATTN - ${esc(letter.kindAttn.toUpperCase().startsWith('MR') || letter.kindAttn.toUpperCase().startsWith('MS') ? letter.kindAttn.toUpperCase() : `MR. ${letter.kindAttn.toUpperCase()}`)}` : ''}</span></div>
  ${letter.refLine ? `<div class="lead">${esc(letter.refLine)}</div>` : ''}
  <div class="lead">We submit our ${type} QUOTATION in Grade ${esc(letter.grade)} as under</div>
  <table class="items">
    <colgroup><col style="width:6%"><col style="width:58%"><col style="width:13%"><col style="width:10%"><col style="width:13%"></colgroup>
    <thead><tr><th>SR.</th><th>DESCRIPTION</th><th>QUANTITY</th><th>Rate PER</th><th>RATE<br>₹</th></tr></thead>
    <tbody>${rows}${total}${blank}</tbody>
  </table>
  <div class="terms">
    <div class="hd"><span class="t">TERMS &amp; CONDITIONS:</span>${company?.gstin ? `<span class="g">GSTIN NO : ${esc(company.gstin)}</span>` : ''}</div>
    ${lh.exciseNo ? `<div class="ex">EXCISE REGISTRATION NO: ${esc(lh.exciseNo)}</div>` : ''}
    <table>${term('DELIVERY', letter.delivery)}${term('TAXES', letter.taxes)}${term('P &amp; F', letter.packing)}${term('FREIGHT', letter.freight)}${term('VALIDITY', letter.validity)}${term('PAYMENT', letter.payment)}</table>
  </div>
  <div class="foot">
    <div>Please find above Quotation in line and favour us with your valued order.${lh.jurisdiction ? `<br><u>Subject to " ${esc(lh.jurisdiction.toUpperCase())} " Jurisdiction</u>` : ''}<br>Our Bank Details are as Under<br>${esc(bankLine)}.<br>${company?.bankAccount ? `C.C.A/c. No. ${esc(company.bankAccount)}` : ''}${company?.bankIfsc ? `&nbsp;&nbsp; IFSC :- ${esc(company.bankIfsc)}` : ''}</div>
    <div class="sig">For, ${esc((company?.name ?? '').toUpperCase())}${lh.signatureUrl ? `<img src="${esc(lh.signatureUrl)}" alt="Signature">` : '<div style="height:46px"></div>'}${signName ? `(${esc(signName.toUpperCase())})` : ''}${signTitle ? `<br>${esc(signTitle)}` : ''}</div>
  </div>
  ${lh.sisterConcern ? `<div class="sister">${multiline(lh.sisterConcern)}</div>` : ''}
  </div>${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>" : "<script>function fit(){var page=document.querySelector('.page');if(!page)return;document.body.style.zoom='';document.body.style.zoom=String(Math.min(1,(window.innerWidth-12)/page.offsetWidth))}window.addEventListener('load',fit);window.addEventListener('resize',fit)</script>"}
  </body></html>`
}

export function buildQuotationHtml(quote: Quotation & RevisionPrint, company?: DocCompany | null): string {
  const currency = quote.currency || 'INR'
  const symbol = currency === 'INR' ? '₹' : currency
  const exportTerms = quote.market === 'export'
  const sums = quote.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const rows = quote.lines
    .map((line, index) => {
      const spec = line.specs?.material ?? {}
      const detail = [spec.grade, spec.weave, spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null, spec.pieces ? `${spec.pieces} pcs` : null].filter(Boolean).join(' · ')
      const packing = line.specs?.packing ?? {}
      const extra = [packing.pack_type, packing.test_standard].filter(Boolean).join(' · ')
      return `<tr><td class="n">${index + 1}</td><td><strong>${esc(line.product?.title ?? '—')}</strong>${line.product?.code ? `<div class="code">${esc(line.product.code)}</div>` : ''}${detail ? `<div class="muted">${esc(detail)}</div>` : ''}${extra ? `<div class="muted">${esc(extra)}</div>` : ''}</td><td class="r">${num(line.quantity)}</td><td class="r">${line.rate == null ? '—' : money(line.rate)}</td><td class="r">${line.discountPercent ? `${line.discountPercent}%` : '—'}</td>${exportTerms ? '' : `<td class="r">${line.gstPercent}%</td>`}<td class="r">${money(exportTerms ? (line.price?.taxable ?? 0) : (line.price?.total ?? 0))}</td></tr>`
    })
    .join('')
  const head = `<tr><th>#</th><th>Item</th><th class="r">Qty (kg)</th><th class="r">Rate ${esc(symbol)}/kg</th><th class="r">Disc.</th>${exportTerms ? '' : '<th class="r">GST</th>'}<th class="r">Amount ${esc(symbol)}</th></tr>`
  const totals = exportTerms
    ? `<div class="totals"><div class="grand"><span>Total ${esc(quote.incoterm ?? '')} ${esc(quote.portOfLoading ?? '')}</span><span>${esc(symbol)} ${money(sums.taxable)}</span></div></div>`
    : `<div class="totals">${sums.discount ? `<div><span>Discount</span><span>− ₹ ${money(sums.discount)}</span></div>` : ''}<div><span>Taxable value</span><span>₹ ${money(sums.taxable)}</span></div><div><span>GST</span><span>₹ ${money(sums.gst)}</span></div><div class="grand"><span>Total</span><span>₹ ${money(sums.total)}</span></div></div>`
  const terms = [
    exportTerms ? `Incoterm: ${esc(quote.incoterm ?? '—')}${quote.portOfLoading ? `, ${esc(quote.portOfLoading)}` : ''}` : quote.pricesIncludeGst ? 'Rates include GST' : 'GST extra as shown',
    exportTerms && quote.country ? `Destination: ${esc(quote.country)}` : '',
    `Currency: ${esc(currency)}`,
    quote.paymentRemarks || quote.paymentTerms ? `Payment: ${esc(quote.paymentRemarks ?? quote.paymentTerms)}` : '',
    quote.deliveryDate ? `Delivery by ${day(quote.deliveryDate)}` : '',
    `Valid until ${day(quote.validUntil)}`,
  ].filter(Boolean)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Quotation ${esc(quote.quoteNo)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0;letter-spacing:.02em} .muted{color:#78716c;font-size:11px} .code{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    ${REVISION_CSS}
    .doc{text-align:right} .doc .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:24px;color:#78716c}
    .totals{margin-left:auto;width:320px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:3px 0}
    .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px}
    ul{margin:4px 0 0;padding-left:16px} .sign{display:flex;justify-content:flex-end;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>${supersededBlock(quote)}
  <div class="top">
    ${companyHeader(company, 'Phenolic laminates, tubes, rods and moulded components')}
    <div class="doc"><div class="kind">Quotation</div><div class="no">${esc(quote.quoteNo)}${revisionTag(quote)}</div><div class="muted">${day(quote.quoteDate)}${quote.enquiryNo ? ` · Ref ${esc(quote.enquiryNo)}` : ''}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>To</h3>${partyLogoHtml(quote.partyLogoUrl)}<strong>${esc(quote.customer?.name ?? '—')}</strong>${quote.billingAddress ? `<div class="muted">${esc(quote.billingAddress)}</div>` : ''}${quote.customer?.gstin ? `<div class="code">GSTIN ${esc(quote.customer.gstin)}</div>` : ''}${quote.customerPoRef ? `<div class="code">Your ref ${esc(quote.customerPoRef)}</div>` : ''}</div>
    <div class="box"><h3>Terms</h3><ul>${terms.map((term) => `<li>${term}</li>`).join('')}</ul></div>
  </div>
  <table><thead>${head}</thead><tbody>${rows}</tbody></table>
  ${totals}
  ${quote.productRemarks ? `<p class="muted" style="margin-top:16px">${esc(quote.productRemarks)}</p>` : ''}
  ${quote.packingRemarks ? `<p class="muted">${esc(quote.packingRemarks)}</p>` : ''}
  <div class="sign"><div>For ${esc(company?.legalName || company?.name || 'Creative Carbon Composites Pvt. Ltd.')}${company?.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

export function printQuotation(quote: Quotation & RevisionPrint, company?: PrintCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(quote.letter && quote.market !== 'export' ? buildQuotationLetterHtml({ ...quote, letter: quote.letter }, company) : buildQuotationHtml(quote, company))
  popup.document.close()
  return true
}
