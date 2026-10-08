import { companyHeader, type DocCompany } from '../../cc_orders/components/printDocs'
import type { Quotation } from './types'

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

export function buildQuotationHtml(quote: Quotation, company?: DocCompany | null): string {
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
    .doc{text-align:right} .doc .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:24px;color:#78716c}
    .totals{margin-left:auto;width:320px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:3px 0}
    .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px}
    ul{margin:4px 0 0;padding-left:16px} .sign{display:flex;justify-content:flex-end;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    ${companyHeader(company, 'Phenolic laminates, tubes, rods and moulded components')}
    <div class="doc"><div class="kind">Quotation</div><div class="no">${esc(quote.quoteNo)}</div><div class="muted">${day(quote.quoteDate)}${quote.enquiryNo ? ` · Ref ${esc(quote.enquiryNo)}` : ''}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>To</h3><strong>${esc(quote.customer?.name ?? '—')}</strong>${quote.billingAddress ? `<div class="muted">${esc(quote.billingAddress)}</div>` : ''}${quote.customer?.gstin ? `<div class="code">GSTIN ${esc(quote.customer.gstin)}</div>` : ''}${quote.customerPoRef ? `<div class="code">Your ref ${esc(quote.customerPoRef)}</div>` : ''}</div>
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

export function printQuotation(quote: Quotation, company?: DocCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildQuotationHtml(quote, company))
  popup.document.close()
  return true
}
