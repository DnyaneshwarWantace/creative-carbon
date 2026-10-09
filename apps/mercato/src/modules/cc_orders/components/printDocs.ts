import type { Order } from './types'

export type DocKind = 'proforma' | 'invoice' | 'challan' | 'packing_list'

export type PrintFulfilment = {
  lines: Array<{ lineId: string; title: string; unit: string; material: Record<string, string>; weights: number[]; packed: number | null; allocations: Array<{ lotNumber: string; qty: number; status: string }> }>
  qc?: {
    lots: Array<{ lotNumber: string; fgInspected: boolean; thickness: { result: string; date: string } | null; boughtIn: boolean }>
    labTests?: Array<{ testDate: string; testType: string; standard: string | null; result: string; reportNo: string | null; lotRefs: string | null }>
  }
}

export type DocCompany = { name: string; legalName?: string | null; gstin?: string | null; address?: string | null; phone?: string | null; email?: string | null; signatory?: string | null }

export function companyHeader(company: DocCompany | null | undefined, subtitle: string): string {
  if (!company) return `<div><h1>CREATIVE CARBON COMPOSITES PVT. LTD.</h1><div class="muted">${subtitle}</div></div>`
  const lines = [company.address ? company.address.replace(/\n/g, '<br>') : '', [company.phone ? `Phone ${company.phone}` : '', company.email ?? ''].filter(Boolean).join(' · ')].filter(Boolean)
  return `<div><h1>${esc(company.legalName || company.name)}</h1><div class="muted">${lines.map((line) => esc(line).replace(/&lt;br&gt;/g, '<br>')).join('<br>')}</div>${company.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}</div>` : ''}<div class="muted">${subtitle}</div></div>`
}

function signName(company: DocCompany | null | undefined): string {
  return company ? esc(company.legalName || company.name) : 'Creative Carbon Composites Pvt. Ltd.'
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

export function buildDocHtml(order: Order, kind: DocKind, company?: DocCompany | null, fulfilment?: PrintFulfilment | null): string {
  const advance = stageData(order, 'advance')
  const invoice = stageData(order, 'invoice')
  const dispatch = stageData(order, 'dispatch')
  const packing = stageData(order, 'packing')
  const shipping = kind === 'challan' || kind === 'packing_list'
  const title = kind === 'proforma' ? 'Proforma invoice' : kind === 'invoice' ? 'Tax invoice' : kind === 'packing_list' ? 'Packing list' : 'Delivery challan'
  const number =
    kind === 'proforma' ? (advance.pi_number ? String(advance.pi_number) : order.orderNo) : kind === 'invoice' ? String(invoice.invoice_number ?? '—') : kind === 'packing_list' ? `PL-${order.orderNo}` : `DC-${order.orderNo}`
  const date = kind === 'invoice' ? day(invoice.invoice_date) : shipping ? day(dispatch.dispatch_date) : day(order.orderDate)

  const priced = !shipping && Boolean(order.totals)
  const sums = order.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const paidSoFar = order.payments ?? { received: 0, due: 0, items: [] }
  const rows = order.lines
    .map((line, index) => {
      const spec = line.specs?.material ?? {}
      const detail = [spec.grade, spec.weave, spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null].filter(Boolean).join(' · ')
      const name = `<strong>${esc(line.product?.title ?? '—')}</strong>${line.product?.code ? `<div class="code">${esc(line.product.code)}</div>` : ''}${detail ? `<div class="muted">${esc(detail)}</div>` : ''}`
      if (!priced) {
        return `<tr><td class="n">${index + 1}</td><td>${name}</td><td class="r">${spec.pieces ? esc(spec.pieces) : '—'}</td><td class="r">${num(line.quantity)}</td></tr>`
      }
      return `<tr><td class="n">${index + 1}</td><td>${name}</td><td class="r">${num(line.quantity)}</td><td class="r">${line.rate == null ? '—' : money(line.rate)}</td><td class="r">${line.discountPercent ? `${line.discountPercent}%` : '—'}</td><td class="r">${money((line.price?.taxable ?? 0))}</td><td class="r">${line.gstPercent}%</td><td class="r">${money((line.price?.total ?? 0))}</td></tr>`
    })
    .join('')

  const head = priced
    ? '<tr><th>#</th><th>Item</th><th class="r">Qty (kg)</th><th class="r">Rate ₹/kg</th><th class="r">Disc.</th><th class="r">Taxable ₹</th><th class="r">GST</th><th class="r">Amount ₹</th></tr>'
    : '<tr><th>#</th><th>Item</th><th class="r">Pieces</th><th class="r">Net kg</th></tr>'

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
    : `<div class="totals"><div class="grand"><span>Total net kg</span><span>${num(Number(packing.net_kg ?? order.lines.reduce((sum, line) => sum + line.quantity, 0)))}</span></div>${packing.gross_kg ? `<div><span>Gross kg</span><span>${num(Number(packing.gross_kg))}</span></div>` : ''}${packing.packages ? `<div><span>Pallets / bundles</span><span>${esc(packing.packages)}</span></div>` : ''}${packing.pack_type ? `<div><span>Packing</span><span>${esc(packing.pack_type)}</span></div>` : ''}</div>`

  const transport =
    shipping
      ? `<div class="box"><h3>Transport</h3><div>${esc(dispatch.transporter ?? '—')}</div><div class="code">LR / BL ${esc(dispatch.lr_number ?? '—')}${dispatch.vehicle_no ? ` · Vehicle ${esc(dispatch.vehicle_no)}` : ''}</div>${dispatch.container_no ? `<div class="code">Container ${esc(dispatch.container_no)}${dispatch.seal_no ? ` · Seal ${esc(dispatch.seal_no)}` : ''}${dispatch.port ? ` · ${esc(dispatch.port)}` : ''}</div>` : ''}${invoice.eway_bill_no ? `<div class="code">E-way bill ${esc(invoice.eway_bill_no)}</div>` : ''}</div>`
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
    .weights{display:grid;grid-template-columns:repeat(8,1fr);gap:2px 10px;margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px} .weights span{display:flex;gap:6px;border-bottom:1px dotted #d6d3d1} .weights b{color:#a8a29e;font-weight:400;width:18px;text-align:right}
    .sign{display:flex;justify-content:space-between;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    ${companyHeader(company, 'Phenolic laminates, tubes, rods and moulded components')}
    <div class="doc"><div class="kind">${esc(title)}</div><div class="no">${esc(number)}</div><div class="muted">${date} · Order ${esc(order.orderNo)}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>${shipping ? 'Deliver to' : 'Bill to'}</h3><strong>${esc(order.customer?.name ?? '—')}</strong>${(shipping ? order.shippingAddress : order.billingAddress) ? `<div class="muted">${esc(shipping ? order.shippingAddress : order.billingAddress)}</div>` : ''}${order.customer?.gstin ? `<div class="code">GSTIN ${esc(order.customer.gstin)}</div>` : ''}${order.customer?.phone ? `<div class="muted">${esc(order.customer.phone)}</div>` : ''}</div>
    ${transport}
  </div>
  <table><thead>${head}</thead><tbody>${rows}</tbody></table>
  ${totals}
  ${kind === 'invoice' && order.billingRemarks ? `<p class="muted" style="margin-top:16px">${esc(order.billingRemarks)}</p>` : ''}
  ${kind === 'packing_list' && fulfilment ? weightsSection(fulfilment) : ''}
  ${shipping && order.packingRemarks ? `<p class="muted" style="margin-top:16px">${esc(order.packingRemarks)}</p>` : ''}
  <div class="sign"><div>${shipping ? 'Received by (name, stamp)' : 'Customer signature'}</div><div>For ${signName(company)}${company?.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

function weightsSection(fulfilment: PrintFulfilment): string {
  return fulfilment.lines
    .filter((line) => line.weights.length || line.allocations.length)
    .map((line) => {
      const lots = line.allocations.filter((entry) => entry.status !== 'released').map((entry) => `${esc(entry.lotNumber)} (${num(entry.qty)} ${esc(line.unit)})`).join(', ')
      const total = line.weights.reduce((sum, weight) => sum + weight, 0)
      const cells = line.weights.map((weight, index) => `<span><b>${index + 1}</b>${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(weight)}</span>`).join('')
      return `<div class="box" style="margin-top:14px"><h3>${esc(line.title)}${line.weights.length ? ` · ${line.weights.length} sheets weighed · ${num(total)} kg` : ''}</h3>${lots ? `<div class="code">Lots: ${lots}</div>` : ''}${cells ? `<div class="weights">${cells}</div>` : '<div class="muted">Not weighed yet</div>'}</div>`
    })
    .join('')
}

export function buildTcCoverHtml(order: Order, fulfilment: PrintFulfilment, company?: DocCompany | null): string {
  const invoice = stageData(order, 'invoice')
  const qcStage = stageData(order, 'qc')
  const standards = [...new Set([...order.lines.map((line) => line.specs?.material?.test_standard), qcStage.standard].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
  const tests = fulfilment.qc?.labTests ?? []
  const lots = fulfilment.qc?.lots ?? []
  const number = `TC-${order.orderNo}`
  const items = order.lines
    .map((line, index) => {
      const spec = line.specs?.material ?? {}
      const detail = [spec.grade, spec.weave, spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null].filter(Boolean).join(' · ')
      return `<tr><td class="n">${index + 1}</td><td><strong>${esc(line.product?.title ?? '—')}</strong>${detail ? `<div class="muted">${esc(detail)}</div>` : ''}</td><td>${esc(spec.test_standard ?? '—')}</td><td class="r">${num(line.quantity)}</td></tr>`
    })
    .join('')
  const lotRows = lots.length
    ? lots.map((lot) => `<tr><td class="mono">${esc(lot.lotNumber)}</td><td>${lot.boughtIn ? 'Bought-in' : lot.thickness ? `${esc(lot.thickness.result === 'pass' ? 'Passed' : lot.thickness.result)} · ${day(lot.thickness.date)}` : '—'}</td><td>${lot.fgInspected ? 'Passed' : '—'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">No lots allocated yet</td></tr>'
  const testRows = tests.length
    ? tests.map((test) => `<tr><td>${day(test.testDate)}</td><td><strong>${esc(test.testType)}</strong></td><td>${esc(test.standard ?? '—')}</td><td class="mono">${esc(test.reportNo ?? '—')}</td><td class="mono">${esc(test.lotRefs ?? '—')}</td><td><strong>${test.result === 'pass' ? 'Pass' : test.result === 'fail' ? 'Fail' : 'Pending'}</strong></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">No lab test linked to this order</td></tr>'
  const allPass = tests.length > 0 && lots.length > 0 && tests.every((test) => test.result === 'pass')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Test certificate ${esc(number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:14px}
    h1{font-size:20px;margin:0} h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#78716c;margin:18px 0 4px}
    .muted{color:#78716c;font-size:11px} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
    .doc{text-align:right} .doc .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0} .box{border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right} .n{width:24px;color:#78716c}
    .decl{margin-top:18px;border:1px solid #1c1917;border-radius:6px;padding:12px;font-size:12.5px}
    .sign{display:flex;justify-content:space-between;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    ${companyHeader(company, 'Phenolic laminates, tubes, rods and moulded components')}
    <div class="doc"><div class="kind">Test certificate</div><div class="no">${esc(number)}</div><div class="muted">${day(new Date().toISOString().slice(0, 10))} · Order ${esc(order.orderNo)}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>Customer</h3><strong>${esc(order.customer?.name ?? '—')}</strong>${order.customerPoRef ? `<div class="code">Your PO ${esc(order.customerPoRef)}</div>` : ''}</div>
    <div class="box"><h3>Reference</h3><div>Invoice ${esc(invoice.invoice_number ?? '—')}${invoice.invoice_date ? ` · ${day(invoice.invoice_date)}` : ''}</div>${qcStage.report_no ? `<div class="code">Test report ${esc(qcStage.report_no)}</div>` : ''}${standards.length ? `<div class="muted">Standard ${esc(standards.join(', '))}</div>` : ''}</div>
  </div>
  <h2>Material supplied</h2>
  <table><thead><tr><th>#</th><th>Item</th><th>Test standard</th><th class="r">Qty</th></tr></thead><tbody>${items}</tbody></table>
  <h2>Lots and in-house checks</h2>
  <table><thead><tr><th>Lot no.</th><th>Thickness inspection</th><th>Finished goods inspection</th></tr></thead><tbody>${lotRows}</tbody></table>
  <h2>Laboratory tests</h2>
  <table><thead><tr><th>Date</th><th>Test</th><th>Standard</th><th>Report no.</th><th>Lots</th><th>Result</th></tr></thead><tbody>${testRows}</tbody></table>
  <div class="decl">${allPass ? `We certify that the material supplied against the above order has been inspected and tested${standards.length ? ` to ${esc(standards.join(', '))}` : ''} and conforms to the requirements. The detailed laboratory reports are attached.` : 'Results above are as tested. The detailed laboratory reports are attached.'}</div>
  <div class="sign"><div>Checked by (QC)</div><div>For ${signName(company)}${company?.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}


export function printDoc(order: Order, kind: DocKind, company?: DocCompany | null, fulfilment?: PrintFulfilment | null): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildDocHtml(order, kind, company, fulfilment))
  popup.document.close()
  return true
}
