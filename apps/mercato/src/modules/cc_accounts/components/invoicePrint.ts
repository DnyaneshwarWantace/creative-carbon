import { amountInWords } from '../lib/amountWords'
import type { CompanyView, InvoiceView } from './types'

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

export function buildInvoiceHtml(doc: InvoiceView, company: CompanyView, forPrint = true): string {
  const credit = doc.kind === 'credit_note'
  const exp = doc.exportDetails
  const cur = exp ? exp.currency : '₹'
  const title = credit ? 'Credit note' : exp ? 'Export invoice' : 'Tax invoice'
  const zeroRated = Boolean(exp && exp.supply === 'lut')
  const bstage = doc.lines.filter((line) => line.bstageLots?.length)
  const ageOn = (madeOn: string | null) => (madeOn ? Math.max(0, Math.round((new Date(`${doc.invoiceDate}T00:00:00Z`).getTime() - new Date(`${madeOn}T00:00:00Z`).getTime()) / 86400000)) : null)
  const bstageTable = bstage.length
    ? `<div class="box" style="margin-top:12px"><h3>B-stage lots supplied (priced per kg)</h3><table><thead><tr><th>Lot no.</th><th>Item</th><th>Cloth / paper</th><th class="r">GSM</th><th>Coated on</th><th class="r">Age (days)</th><th class="r">Kg</th></tr></thead><tbody>${bstage
        .flatMap((line) =>
          (line.bstageLots ?? []).map((lot) => {
            const age = ageOn(lot.madeOn)
            return `<tr><td class="mono">${esc(lot.lotNumber)}</td><td>${esc(line.title)}</td><td>${esc(lot.cloth ?? '—')}</td><td class="r">${lot.gsm ?? '—'}</td><td>${day(lot.madeOn)}</td><td class="r">${age ?? '—'}</td><td class="r">${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(lot.kg)}</td></tr>`
          }),
        )
        .join('')}</tbody></table><div class="muted" style="margin-top:6px">B-stage is resin-impregnated cloth / paper. Store cool and dry, away from sunlight; press within the shelf life counted from the coating date.</div></div>`
    : ''
  const taxHead = zeroRated ? '' : doc.interState ? `<th class="r">IGST ${cur}</th>` : `<th class="r">CGST ${cur}</th><th class="r">SGST ${cur}</th>`
  const rows = doc.lines
    .map((line, index) => {
      const tax = zeroRated
        ? ''
        : doc.interState
        ? `<td class="r">${money(line.igst)}<div class="code">${line.gstPercent}%</div></td>`
        : `<td class="r">${money(line.cgst)}<div class="code">${line.gstPercent / 2}%</div></td><td class="r">${money(line.sgst)}<div class="code">${line.gstPercent / 2}%</div></td>`
      return `<tr><td class="n">${index + 1}</td><td><strong>${esc(line.brandName ? `${line.brandName} ` : '')}${esc(line.title)}</strong>${line.code ? `<div class="code">${esc(line.code)}${line.packSize ? ` · ${esc(line.packSize)}` : ''}</div>` : ''}</td><td class="mono">${esc(line.hsn ?? '—')}</td><td class="r">${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(line.quantity)}${line.unit ? ` ${esc(line.unit)}` : ''}</td><td class="r">${line.rate == null ? '—' : money(line.rate)}</td><td class="r">${line.discountPercent ? `${line.discountPercent}%` : '—'}</td><td class="r">${money(line.taxable)}</td>${tax}<td class="r">${money(line.total)}</td></tr>`
    })
    .join('')
  const hsn = new Map<string, { taxable: number; rate: number; tax: number }>()
  for (const line of doc.lines) {
    const key = `${line.hsn ?? '—'}|${line.gstPercent}`
    const current = hsn.get(key) ?? { taxable: 0, rate: line.gstPercent, tax: 0 }
    hsn.set(key, { taxable: current.taxable + line.taxable, rate: line.gstPercent, tax: current.tax + line.gst })
  }
  const hsnRows = [...hsn.entries()].map(([key, value]) => `<tr><td class="mono">${esc(key.split('|')[0])}</td><td class="r">${money(value.taxable)}</td><td class="r">${value.rate}%</td><td class="r">${money(value.tax)}</td></tr>`).join('')
  const watermark = doc.status === 'cancelled' ? '<div class="wm">CANCELLED</div>' : doc.status === 'draft' ? '<div class="wm">DRAFT</div>' : ''
  const declaration = exp ? (exp.supply === 'lut' ? `Supply meant for export under LUT${company.lutArn ? ` (ARN ${esc(company.lutArn)})` : ''} without payment of IGST` : 'Supply meant for export on payment of IGST') : ''
  const rate = exp && exp.currency !== 'INR' && exp.exchangeRate ? exp.exchangeRate : null
  const shipment = exp
    ? [
        exp.incoterm ? `Terms: ${esc(exp.incoterm)}` : '',
        exp.portOfLoading || exp.portOfDischarge ? `Port: ${esc(exp.portOfLoading ?? '—')} → ${esc(exp.portOfDischarge ?? '—')}` : '',
        exp.country ? `Final destination: ${esc(exp.country)}` : '',
        exp.vessel ? `Vessel / flight: ${esc(exp.vessel)}` : '',
        exp.containerNo || exp.sealNo ? `Container ${esc(exp.containerNo ?? '—')} · Seal ${esc(exp.sealNo ?? '—')}` : '',
        exp.shippingBillNo ? `Shipping bill ${esc(exp.shippingBillNo)}${exp.shippingBillDate ? ` dt ${day(exp.shippingBillDate)}` : ''}` : '',
      ]
        .filter(Boolean)
        .join('<br>')
    : ''
  const exportBox = exp
    ? [company.iec ? `IEC ${esc(company.iec)}` : '', company.lutArn ? `LUT ARN ${esc(company.lutArn)}${company.lutValidTill ? ` (valid till ${day(company.lutValidTill)})` : ''}` : '', exp.lcNumber ? `LC no. ${esc(exp.lcNumber)}` : '', rate ? `Exchange rate ₹ ${money(rate)} per ${esc(exp.currency)}` : ''].filter(Boolean).join('<br>')
    : ''
  const transport = [doc.transporter ? `Transporter: ${esc(doc.transporter)}` : '', doc.vehicleNo ? `Vehicle: ${esc(doc.vehicleNo)}` : '', doc.lrNo ? `LR: ${esc(doc.lrNo)}` : '', doc.ewayBillNo ? `E-way bill: ${esc(doc.ewayBillNo)}` : ''].filter(Boolean).join('<br>')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${esc(doc.code)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:30px;font-size:11.5px;position:relative}
    .wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:96px;font-weight:800;color:rgba(120,113,108,.12);transform:rotate(-18deg);pointer-events:none}
    .top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #1c1917;padding-bottom:12px}
    h1{font-size:19px;margin:0 0 2px} .muted{color:#78716c;font-size:10.5px;line-height:1.45} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    .doc{text-align:right} .kind{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#78716c;font-weight:700} .no{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;margin-top:2px}
    .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:14px 0}
    .box{border:1px solid #d6d3d1;border-radius:6px;padding:9px 11px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse;margin-top:6px} th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px 5px}
    td{padding:6px 5px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:20px;color:#78716c}
    .sum{display:grid;grid-template-columns:1fr 300px;gap:18px;margin-top:12px;align-items:start}
    .totals div{display:flex;justify-content:space-between;padding:2px 0} .totals .grand{border-top:1px solid #1c1917;font-weight:700;font-size:14px;padding-top:6px}
    .words{font-style:italic;margin-top:4px} .decl{margin-top:6px;font-size:10px;font-weight:600;max-width:280px;margin-left:auto} .hsn{margin-top:10px} .hsn th,.hsn td{font-size:10px}
    .terms{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .sign{display:flex;justify-content:space-between;margin-top:44px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:10mm}}
  </style></head><body>
  ${watermark}
  <div class="top">
    <div>
      <h1>${esc(company.legalName || company.name)}</h1>
      <div class="muted">${multiline(company.address)}${company.phone ? `<br>Phone ${esc(company.phone)}` : ''}${company.email ? ` · ${esc(company.email)}` : ''}</div>
      ${company.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}${company.pan ? ` · PAN ${esc(company.pan)}` : ''}</div>` : ''}
    </div>
    <div class="doc">
      <div class="kind">${title}${bstage.length && !exp ? ' · B-stage sale' : ''}</div>
      <div class="no">${esc(doc.code)}</div>
      ${declaration ? `<div class="decl">${declaration}</div>` : ''}
      <div class="muted">Date ${day(doc.invoiceDate)}${!credit && doc.dueDate ? `<br>Due ${day(doc.dueDate)}` : ''}<br>Order ${esc(doc.orderNo)}${credit && doc.againstCode ? `<br>Against invoice ${esc(doc.againstCode)}` : ''}</div>
    </div>
  </div>
  <div class="grid">
    <div class="box"><h3>Bill to</h3><strong>${esc(doc.customerName)}</strong>${doc.customerGstin ? `<div class="code">GSTIN ${esc(doc.customerGstin)}</div>` : ''}</div>
    ${
      exp
        ? `<div class="box"><h3>Shipment</h3><div class="muted" style="color:#1c1917">${shipment || '—'}</div></div><div class="box"><h3>Export</h3><div class="muted" style="color:#1c1917">${exportBox || '—'}</div></div>`
        : `<div class="box"><h3>Place of supply</h3><div>${esc(doc.placeOfSupply ?? '—')}</div><div class="muted">${doc.interState ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</div></div><div class="box"><h3>Transport</h3><div class="muted" style="color:#1c1917">${transport || '—'}</div></div>`
    }
  </div>
  <table>
    <thead><tr><th>#</th><th>Product</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate ${cur}</th><th class="r">Disc.</th><th class="r">Taxable ${cur}</th>${taxHead}<th class="r">Amount ${cur}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${bstageTable}
  <div class="sum">
    <div>
      <div class="muted">Amount in words</div><div class="words">${esc(amountInWords(doc.totals.payable, exp?.currency ?? 'INR'))}</div>
      ${rate ? `<div class="muted" style="margin-top:4px">Value in rupees: ₹ ${money(Math.round(doc.totals.payable * rate * 100) / 100)} at ₹ ${money(rate)} per ${esc(exp!.currency)}</div>` : ''}
      <table class="hsn"><thead><tr><th>HSN</th><th class="r">Taxable ${cur}</th><th class="r">GST rate</th><th class="r">Tax ${cur}</th></tr></thead><tbody>${hsnRows}</tbody></table>
      ${doc.notes ? `<div class="muted" style="margin-top:8px">${multiline(doc.notes)}</div>` : ''}
    </div>
    <div class="totals">
      ${doc.totals.discount ? `<div><span>Discount</span><span>− ${cur} ${money(doc.totals.discount)}</span></div>` : ''}
      <div><span>${exp ? `${esc(exp.incoterm ?? '')} value`.trim() : 'Taxable value'}</span><span>${cur} ${money(doc.totals.taxable)}</span></div>
      ${zeroRated ? '<div><span>IGST (LUT)</span><span>0.00</span></div>' : doc.interState ? `<div><span>IGST</span><span>${cur} ${money(doc.totals.igst)}</span></div>` : `<div><span>CGST</span><span>${cur} ${money(doc.totals.cgst)}</span></div><div><span>SGST</span><span>${cur} ${money(doc.totals.sgst)}</span></div>`}
      ${doc.totals.roundOff ? `<div><span>Round off</span><span>${cur} ${money(doc.totals.roundOff)}</span></div>` : ''}
      <div class="grand"><span>${credit ? 'Credit amount' : 'Amount payable'}</span><span>${cur} ${money(doc.totals.payable)}</span></div>
    </div>
  </div>
  <div class="terms">
    <div class="box"><h3>Terms</h3><div class="muted" style="color:#1c1917">${multiline(doc.terms) || '—'}</div></div>
    <div class="box"><h3>Bank details</h3><div class="muted" style="color:#1c1917">${multiline(doc.bankDetails) || '—'}</div></div>
  </div>
  ${exp ? '<div class="muted" style="margin-top:10px">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>' : ''}
  <div class="sign"><div>Receiver's signature</div><div>For ${esc(company.legalName || company.name)}${company.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  ${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>" : ''}
  </body></html>`
}

export function printInvoice(doc: InvoiceView, company: CompanyView): boolean {
  const popup = window.open('', '_blank', 'width=1000,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildInvoiceHtml(doc, company))
  popup.document.close()
  return true
}
