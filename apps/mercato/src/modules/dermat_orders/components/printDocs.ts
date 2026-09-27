import type { Order } from './types'

export type DocKind = 'proforma' | 'invoice' | 'challan' | 'packing_list'

export type DocCompany = { name: string; legalName?: string | null; gstin?: string | null; address?: string | null; phone?: string | null; email?: string | null; signatory?: string | null }

export function companyHeader(company: DocCompany | null | undefined, subtitle: string): string {
  if (!company) return `<div><h1>DERMAT INDIA</h1><div class="muted">${subtitle}</div></div>`
  const lines = [company.address ? company.address.replace(/\n/g, '<br>') : '', [company.phone ? `Phone ${company.phone}` : '', company.email ?? ''].filter(Boolean).join(' · ')].filter(Boolean)
  return `<div><h1>${esc(company.legalName || company.name)}</h1><div class="muted">${lines.map((line) => esc(line).replace(/&lt;br&gt;/g, '<br>')).join('<br>')}</div>${company.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}</div>` : ''}<div class="muted">${subtitle}</div></div>`
}

function signName(company: DocCompany | null | undefined): string {
  return company ? esc(company.legalName || company.name) : 'Dermat India'
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function num(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function day(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function stageData(order: Order, key: string): Record<string, unknown> {
  return order.stages.find((stage) => stage.key === key)?.data ?? {}
}

function expiryFor(mfg: unknown, months: string | undefined): string {
  const count = Number((months ?? '').match(/(\d{1,3})/)?.[1] ?? 0)
  if (typeof mfg !== 'string' || !mfg || !count) return '—'
  const date = new Date(`${mfg}T00:00:00`)
  date.setMonth(date.getMonth() + count)
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function buildDocHtml(order: Order, kind: DocKind, company?: DocCompany | null): string {
  const advance = stageData(order, 'advance')
  const billing = stageData(order, 'billing')
  const dispatch = stageData(order, 'dispatch')
  const mfg = stageData(order, 'manufacturing')
  const packing = stageData(order, 'packing')
  const shipping = kind === 'challan' || kind === 'packing_list'
  const title = kind === 'proforma' ? 'Proforma invoice' : kind === 'invoice' ? 'Tax invoice' : kind === 'packing_list' ? 'Packing list' : 'Delivery challan'
  const number =
    kind === 'proforma' ? (advance.pi_number ? String(advance.pi_number) : order.orderNo) : kind === 'invoice' ? String(billing.invoice_number ?? '—') : kind === 'packing_list' ? `PL-${order.orderNo}` : `DC-${order.orderNo}`
  const date = kind === 'invoice' ? day(billing.invoice_date) : shipping ? day(dispatch.dispatch_date) : day(order.orderDate)

  const priced = !shipping && Boolean(order.totals)
  const sums = order.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const paidSoFar = order.payments ?? { received: 0, due: 0, items: [] }
  const rows = order.lines
    .map((line, index) => {
      const name = `<strong>${esc(line.product?.title ?? '—')}</strong>${line.product?.code ? `<div class="code">${esc(line.product.code)}</div>` : ''}${line.packSize ? `<div class="muted">${esc(line.packSize)}${line.brandName ? ` · ${esc(line.brandName)}` : ''}</div>` : ''}`
      if (!priced) {
        return `<tr><td class="n">${index + 1}</td><td>${name}</td><td class="mono">${esc(mfg.batch_no ?? '—')}</td><td>${day(mfg.mfg_date)}</td><td>${expiryFor(mfg.mfg_date, line.specs?.production?.expiry_month)}</td><td class="r">${num(line.quantity)} pcs</td></tr>`
      }
      return `<tr><td class="n">${index + 1}</td><td>${name}</td><td class="r">${num(line.quantity)}</td><td class="r">${line.rate == null ? '—' : money(line.rate)}</td><td class="r">${line.discountPercent ? `${line.discountPercent}%` : '—'}</td><td class="r">${money((line.price?.taxable ?? 0))}</td><td class="r">${line.gstPercent}%</td><td class="r">${money((line.price?.total ?? 0))}</td></tr>`
    })
    .join('')

  const head = priced
    ? '<tr><th>#</th><th>Product</th><th class="r">Qty (pcs)</th><th class="r">Rate ₹</th><th class="r">Disc.</th><th class="r">Taxable ₹</th><th class="r">GST</th><th class="r">Amount ₹</th></tr>'
    : '<tr><th>#</th><th>Product</th><th>Batch</th><th>Mfg.</th><th>Exp.</th><th class="r">Quantity</th></tr>'

  const taxRows = `<div><span>GST</span><span>₹ ${money(sums.gst)}</span></div>`

  const totals = priced
    ? `<div class="totals">
        ${sums.discount ? `<div><span>Discount</span><span>− ₹ ${money(sums.discount)}</span></div>` : ''}
        <div><span>Taxable value</span><span>₹ ${money(sums.taxable)}</span></div>
        ${taxRows}
        <div class="grand"><span>Total</span><span>₹ ${money(sums.total)}</span></div>
        ${
          kind === 'proforma' && advance.advance_percent
            ? `<div class="due"><span>Advance ${esc(advance.advance_percent)}% to confirm</span><span>₹ ${money((sums.total * Number(advance.advance_percent)) / 100)}</span></div>`
            : ''
        }
        ${kind === 'invoice' ? `<div><span>Received so far</span><span>₹ ${money(paidSoFar.received)}</span></div><div class="due"><span>Balance due</span><span>₹ ${money(Math.max(0, paidSoFar.due))}</span></div>` : ''}
      </div>`
    : `<div class="totals"><div class="grand"><span>Total pieces</span><span>${num(order.lines.reduce((sum, line) => sum + line.quantity, 0))}</span></div>${dispatch.packages || packing.shippers ? `<div><span>Boxes / shippers</span><span>${esc(dispatch.packages ?? packing.shippers)}</span></div>` : ''}${kind === 'packing_list' && packing.location ? `<div><span>Packed at</span><span>${esc(packing.location)}</span></div>` : ''}</div>`

  const transport =
    shipping
      ? `<div class="box"><h3>Transport</h3><div>${esc(dispatch.transporter ?? '—')}</div><div class="code">LR ${esc(dispatch.lr_number ?? '—')}${dispatch.vehicle_no ? ` · Vehicle ${esc(dispatch.vehicle_no)}` : ''}</div>${dispatch.eway_bill_no ? `<div class="code">E-way bill ${esc(dispatch.eway_bill_no)}${dispatch.eway_bill_date ? ` · ${day(dispatch.eway_bill_date)}` : ''}</div>` : ''}</div>`
      : `<div class="box"><h3>Terms</h3><div>${esc(order.paymentRemarks ?? order.paymentTerms ?? '—')}</div>${order.customerPoRef ? `<div class="code">Customer PO ${esc(order.customerPoRef)}</div>` : ''}</div>`

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0;letter-spacing:.02em} .muted{color:#78716c;font-size:11px} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    .doc{text-align:right} .doc .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:24px;color:#78716c}
    .totals{margin-left:auto;width:300px;margin-top:10px} .totals div{display:flex;justify-content:space-between;padding:3px 0}
    .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px} .totals .due{font-weight:700}
    .sign{display:flex;justify-content:space-between;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    ${companyHeader(company, 'Cosmetic contract manufacturing')}
    <div class="doc"><div class="kind">${esc(title)}</div><div class="no">${esc(number)}</div><div class="muted">${date} · Order ${esc(order.orderNo)}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>${shipping ? 'Deliver to' : 'Bill to'}</h3><strong>${esc(order.customer?.name ?? '—')}</strong>${(shipping ? order.shippingAddress : order.billingAddress) ? `<div class="muted">${esc(shipping ? order.shippingAddress : order.billingAddress)}</div>` : ''}${order.customer?.gstin ? `<div class="code">GSTIN ${esc(order.customer.gstin)}</div>` : ''}${order.customer?.phone ? `<div class="muted">${esc(order.customer.phone)}</div>` : ''}</div>
    ${transport}
  </div>
  <table><thead>${head}</thead><tbody>${rows}</tbody></table>
  ${totals}
  ${kind === 'invoice' && order.billingRemarks ? `<p class="muted" style="margin-top:16px">${esc(order.billingRemarks)}</p>` : ''}
  ${shipping && order.packingRemarks ? `<p class="muted" style="margin-top:16px">${esc(order.packingRemarks)}</p>` : ''}
  <div class="sign"><div>${shipping ? 'Received by (name, stamp)' : 'Customer signature'}</div><div>For ${signName(company)}${company?.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

export function printDoc(order: Order, kind: DocKind, company?: DocCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildDocHtml(order, kind, company))
  popup.document.close()
  return true
}

type CoaCheck = {
  code: string
  operation: string
  productTitle: string
  batchNo: string | null
  status: string
  chemicalStatus: string
  microStatus: string
  chemicalBy: string | null
  chemicalAt: string | null
  microBy: string | null
  microAt: string | null
  results: Array<{ name: string; class: string; spec: string; test: string; observation: string; remark: string }>
}

export function buildCoaHtml(order: Order, checks: CoaCheck[], company?: DocCompany | null): string {
  const mfg = stageData(order, 'manufacturing')
  const qa = order.stages.find((stage) => stage.key === 'qc_qa')
  const qaData = stageData(order, 'qc_qa')
  const allPassed = checks.length > 0 && checks.every((check) => check.status === 'passed')
  const lineRows = order.lines
    .map((line) => `<tr><td><strong>${esc(line.product?.title ?? '—')}</strong>${line.product?.code ? `<div class="code">${esc(line.product.code)}</div>` : ''}</td><td>${esc(line.packSize ?? '—')}</td><td class="mono">${esc(mfg.batch_no ?? '—')}</td><td>${day(mfg.mfg_date)}</td><td>${expiryFor(mfg.mfg_date, line.specs?.production?.expiry_month)}</td><td class="r">${num(line.quantity)} pcs</td></tr>`)
    .join('')
  const sections = checks
    .map((check) => {
      const title = check.operation === 'bulk' ? 'Bulk (semi-finished)' : check.operation === 'packing' ? 'Finished good' : check.operation === 'filling' ? 'After filling' : check.operation
      const rows = check.results
        .map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.class)}</td><td>${esc(row.spec || '—')}</td><td><strong>${esc(row.observation || '—')}</strong></td><td>${row.test === 'micro' ? 'Micro' : 'Chemical'}</td><td>${esc(row.remark || '')}</td></tr>`)
        .join('')
      const sign = [
        check.chemicalStatus !== 'na' ? `Chemical: <strong>${esc(check.chemicalStatus)}</strong>${check.chemicalBy ? ` · ${esc(check.chemicalBy)}` : ''}${check.chemicalAt ? ` · ${day(check.chemicalAt)}` : ''}` : '',
        check.microStatus !== 'na' ? `Micro: <strong>${esc(check.microStatus)}</strong>${check.microBy ? ` · ${esc(check.microBy)}` : ''}${check.microAt ? ` · ${day(check.microAt)}` : ''}` : '',
      ]
        .filter(Boolean)
        .join(' &nbsp;|&nbsp; ')
      return `<h2>${esc(title)} <span class="code">${esc(check.code)} · ${esc(check.productTitle)}${check.batchNo ? ` · batch ${esc(check.batchNo)}` : ''}</span></h2>
        <table><thead><tr><th>Parameter</th><th>Class</th><th>Specification</th><th>Observation</th><th>Test</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="muted">${sign}</p>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>COA ${esc(order.orderNo)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0} h2{font-size:13px;margin:22px 0 4px} .muted{color:#57534e;font-size:11px} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e;font-weight:400}
    .doc{text-align:right} .doc .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:6px} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:5px}
    td{padding:6px 5px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right}
    .verdict{margin-top:22px;padding:10px 12px;border:2px solid ${allPassed ? '#15803d' : '#b91c1c'};border-radius:6px;font-weight:700;font-size:13px}
    .sign{display:flex;justify-content:space-between;margin-top:48px} .sign div{width:30%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    ${companyHeader(company, 'Certificate of Analysis')}
    <div class="doc"><div class="kind">COA</div><div class="no">${esc(order.orderNo)}</div><div class="muted">${esc(order.customer?.name ?? '')}</div></div>
  </div>
  <table style="margin-top:16px"><thead><tr><th>Product</th><th>Pack</th><th>Batch</th><th>Mfg.</th><th>Exp.</th><th class="r">Quantity</th></tr></thead><tbody>${lineRows}</tbody></table>
  ${sections || '<p class="muted" style="margin-top:18px">No QC results recorded for this order.</p>'}
  <div class="verdict">${allPassed ? 'Result: COMPLIES with specification' : 'Result: NOT RELEASED — QC not complete or failed'}${qa?.status === 'done' ? ` · Released by QA ${esc(qa.completedByName ?? '')} on ${day(qaData.released_on ?? qa.completedAt)}` : ''}</div>
  <div class="sign"><div>QC Chemical</div><div>QC Micro</div><div>QA Head</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>
  </body></html>`
}

export async function printCoa(order: Order, load: (id: string) => Promise<CoaCheck | null>, company?: DocCompany | null): Promise<boolean> {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.write('<p style="font-family:sans-serif;padding:24px">Preparing the certificate…</p>')
  const ids = [...(order.qc?.manufacturing ?? []), ...(order.qc?.filling ?? []), ...(order.qc?.packing ?? [])].filter((check) => check.status === 'passed').map((check) => check.id)
  const checks = (await Promise.all(ids.map(load))).filter((check): check is CoaCheck => Boolean(check))
  popup.document.open()
  popup.document.write(buildCoaHtml(order, checks, company))
  popup.document.close()
  return true
}

export type { CoaCheck }
