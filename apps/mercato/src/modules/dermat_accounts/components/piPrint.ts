import { rupeesInWords } from '../lib/amountWords'
import type { CompanyView, PiView } from './types'

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function multiline(value: string | null): string {
  return esc(value ?? '').replace(/\n/g, '<br>')
}

export function buildPiHtml(pi: PiView, company: CompanyView, forPrint = true): string {
  const rows = pi.lines
    .map(
      (line, index) => `<tr>
        <td class="n">${index + 1}</td>
        <td><strong>${esc(line.brandName ? `${line.brandName} ` : '')}${esc(line.title)}</strong>${line.code ? `<div class="code">${esc(line.code)}${line.packSize ? ` · ${esc(line.packSize)}` : ''}</div>` : ''}</td>
        <td class="mono">${esc(line.hsn ?? '—')}</td>
        <td class="r">${new Intl.NumberFormat('en-IN').format(line.quantity)}</td>
        <td class="r">${line.rate == null ? '—' : money(line.rate)}</td>
        <td class="r">${line.discountPercent ? `${line.discountPercent}%` : '—'}</td>
        <td class="r">${money(line.taxable)}</td>
        <td class="r">${line.gstPercent}%<div class="code">${money(line.gst)}</div></td>
        <td class="r">${money(line.total)}</td>
      </tr>`,
    )
    .join('')
  const watermark = pi.status === 'cancelled' ? '<div class="wm">CANCELLED</div>' : pi.status === 'draft' ? '<div class="wm">DRAFT</div>' : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Proforma invoice ${esc(pi.code)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px;position:relative}
    .wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:96px;font-weight:800;color:rgba(120,113,108,.12);transform:rotate(-18deg);pointer-events:none}
    .top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0 0 2px} .muted{color:#78716c;font-size:11px;line-height:1.45} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    .doc{text-align:right} .kind{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#78716c;font-weight:700} .no{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;margin-top:2px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:6px} th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:22px;color:#78716c}
    .sum{display:grid;grid-template-columns:1fr 320px;gap:18px;margin-top:12px;align-items:start}
    .totals div{display:flex;justify-content:space-between;padding:3px 0} .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px} .totals .adv{background:#f5f5f4;border-radius:4px;padding:6px 8px;margin-top:6px;font-weight:700}
    .words{font-style:italic;margin-top:6px}
    .terms{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .sign{display:flex;justify-content:space-between;margin-top:48px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:12mm}}
  </style></head><body>
  ${watermark}
  <div class="top">
    <div>
      <h1>${esc(company.legalName || company.name)}</h1>
      <div class="muted">${multiline(company.address)}${company.phone ? `<br>Phone ${esc(company.phone)}` : ''}${company.email ? ` · ${esc(company.email)}` : ''}</div>
      ${company.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}${company.pan ? ` · PAN ${esc(company.pan)}` : ''}</div>` : ''}
    </div>
    <div class="doc">
      <div class="kind">Proforma invoice</div>
      <div class="no">${esc(pi.code)}</div>
      <div class="muted">Date ${day(pi.piDate)}<br>Valid until ${day(pi.validUntil)}<br>Order ${esc(pi.orderNo)}</div>
    </div>
  </div>
  <div class="grid">
    <div class="box"><h3>Bill to</h3><strong>${esc(pi.customerName)}</strong>${pi.customerGstin ? `<div class="code">GSTIN ${esc(pi.customerGstin)}</div>` : ''}</div>
    <div class="box"><h3>Bank details for payment</h3><div class="muted" style="color:#1c1917">${multiline(pi.bankDetails) || '—'}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Product</th><th>HSN</th><th class="r">Qty (pcs)</th><th class="r">Rate ₹</th><th class="r">Disc.</th><th class="r">Taxable ₹</th><th class="r">GST</th><th class="r">Amount ₹</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sum">
    <div><div class="muted">Amount in words</div><div class="words">${esc(rupeesInWords(pi.totals.total))}</div>${pi.pricesIncludeGst ? '<div class="muted" style="margin-top:6px">Rates include GST.</div>' : ''}${pi.notes ? `<div class="muted" style="margin-top:8px">${multiline(pi.notes)}</div>` : ''}</div>
    <div class="totals">
      ${pi.totals.discount ? `<div><span>Discount</span><span>− ₹ ${money(pi.totals.discount)}</span></div>` : ''}
      <div><span>Taxable value</span><span>₹ ${money(pi.totals.taxable)}</span></div>
      <div><span>GST</span><span>₹ ${money(pi.totals.gst)}</span></div>
      <div class="grand"><span>Total</span><span>₹ ${money(pi.totals.total)}</span></div>
      ${pi.advancePercent ? `<div class="adv"><span>Advance ${pi.advancePercent}% to confirm the order</span><span>₹ ${money(pi.advanceAmount ?? 0)}</span></div>` : ''}
    </div>
  </div>
  <div class="terms">
    <div class="box"><h3>Terms</h3><div class="muted" style="color:#1c1917">${multiline(pi.terms) || '—'}</div></div>
    <div class="box"><h3>Customer acceptance</h3><div class="muted">Please sign and return with the advance payment reference (UTR).</div></div>
  </div>
  <div class="sign"><div>Customer signature and stamp</div><div>For ${esc(company.legalName || company.name)}${company.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  ${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>" : ''}
  </body></html>`
}

export function printPi(pi: PiView, company: CompanyView): boolean {
  const popup = window.open('', '_blank', 'width=980,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildPiHtml(pi, company))
  popup.document.close()
  return true
}
