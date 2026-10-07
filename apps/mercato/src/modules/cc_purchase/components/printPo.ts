import type { PoView } from './shared'

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

export function buildPurchaseOrderHtml(po: PoView): string {
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
    .doc{text-align:right} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:24px;color:#78716c}
    .totals{margin-left:auto;width:260px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:3px 0} .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px}
    .terms{margin-top:22px} .sign{display:flex;justify-content:space-between;margin-top:48px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    .wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90px;color:rgba(0,0,0,.06);transform:rotate(-20deg);font-weight:800}
    @media print{body{padding:16mm}}
  </style></head><body>
  ${draft ? '<div class="wm">NOT APPROVED</div>' : ''}
  <div class="top">
    <div><h1>CREATIVE CARBON</h1><div class="muted">Purchase order</div></div>
    <div class="doc"><div class="no">${escapeHtml(po.code)}</div><div class="muted">Date ${day(po.poDate)}</div>${po.expectedDate ? `<div class="muted">Deliver by ${day(po.expectedDate)}</div>` : ''}</div>
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

export function printPurchaseOrder(po: PoView): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildPurchaseOrderHtml(po))
  popup.document.close()
  return true
}
