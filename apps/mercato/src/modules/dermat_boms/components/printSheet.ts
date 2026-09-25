import type { BomKind } from '../lib/bomKinds'

export type PrintLine = {
  code: string | null
  name: string
  kind: string
  value: number
  quantity: number
  unit: string
  remark: string
}

export type PrintSheetInput = {
  kind: BomKind
  productName: string
  productCode: string | null
  bomCode: string | null
  version: number
  status: string
  batchSize: number
  batchUnit: string
  lines: PrintLine[]
  notes: string
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  labels: Record<string, string>
}

const KIND_LABEL: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk' }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function formatNumber(value: number, digits: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

export function buildPrintSheetHtml(input: PrintSheetInput): string {
  const { labels } = input
  const formula = input.kind === 'formula'
  const totalPercent = input.lines.reduce((sum, line) => sum + line.value, 0)
  const totalQty = input.lines.reduce((sum, line) => sum + line.quantity, 0)
  const rows = input.lines
    .map(
      (line, index) => `<tr>
        <td class="c">${index + 1}</td>
        <td class="mono">${escapeHtml(line.code ?? '—')}</td>
        <td>${escapeHtml(line.name)}</td>
        <td class="c">${escapeHtml(KIND_LABEL[line.kind] ?? line.kind)}</td>
        <td class="r mono">${formula ? `${formatNumber(line.value, 4)} %` : formatNumber(line.value, 5)}</td>
        <td class="r mono strong">${formatNumber(line.quantity, 3)}</td>
        <td class="c">${escapeHtml(line.unit)}</td>
        <td>${escapeHtml(line.remark)}</td>
      </tr>`,
    )
    .join('')
  const approved = input.status === 'approved' && input.approvedByName
  const printedOn = new Date().toLocaleString('en-IN')
  const approvedOn = input.approvedAt ? new Date(input.approvedAt).toLocaleDateString('en-IN') : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(`${input.bomCode ?? 'BOM'} ${input.productName}`)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.08em; }
  .doc { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .status { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 1px solid #111; border-radius: 3px; font-weight: 700; font-size: 10px; text-transform: uppercase; }
  .status.draft { border-style: dashed; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 12px 0; border: 1px solid #999; }
  .grid div { padding: 6px 8px; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }
  .grid span { display: block; color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  .grid b { font-size: 12px; }
  .wide { grid-column: span 2; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #eee; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
  th, td { border: 1px solid #999; padding: 5px 6px; vertical-align: top; }
  tfoot td { font-weight: 700; background: #f5f5f5; }
  .c { text-align: center; } .r { text-align: right; } .mono { font-family: "SFMono-Regular", Menlo, Consolas, monospace; } .strong { font-weight: 700; }
  .notes { margin-top: 12px; border: 1px solid #999; padding: 8px; min-height: 48px; white-space: pre-wrap; }
  .notes span { display: block; color: #555; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; }
  .stamps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; }
  .stamps div { border-top: 1px solid #111; padding-top: 4px; }
  .stamps span { display: block; color: #555; font-size: 9px; text-transform: uppercase; }
  .foot { margin-top: 16px; color: #777; font-size: 9px; display: flex; justify-content: space-between; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 90px; font-weight: 800; color: rgba(0,0,0,0.06); transform: rotate(-24deg); pointer-events: none; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  ${input.status === 'approved' ? '' : `<div class="watermark">${escapeHtml(labels.watermark)}</div>`}
  <header>
    <div><div class="brand">DERMAT INDIA</div><div class="doc">${escapeHtml(formula ? labels.formulaTitle : labels.packTitle)}</div></div>
    <div style="text-align:right"><div class="mono strong">${escapeHtml(input.bomCode ?? '')}</div><div class="status ${input.status === 'approved' ? '' : 'draft'}">${escapeHtml(labels[`status_${input.status}`] ?? input.status)}</div></div>
  </header>
  <div class="grid">
    <div class="wide"><span>${escapeHtml(labels.product)}</span><b>${escapeHtml(input.productName)}</b></div>
    <div><span>${escapeHtml(labels.productCode)}</span><b class="mono">${escapeHtml(input.productCode ?? '—')}</b></div>
    <div><span>${escapeHtml(labels.version)}</span><b>v${input.version}</b></div>
    <div><span>${escapeHtml(labels.batch)}</span><b>${formatNumber(input.batchSize, 3)} ${escapeHtml(input.batchUnit)}</b></div>
    <div><span>${escapeHtml(labels.lines)}</span><b>${input.lines.length}</b></div>
    <div><span>${escapeHtml(formula ? labels.totalPercent : labels.bulkPerPiece)}</span><b>${
      formula
        ? `${formatNumber(totalPercent, 4)} %`
        : `${formatNumber(input.lines.filter((line) => line.kind === 'bulk').reduce((sum, line) => sum + line.value, 0), 5)} kg`
    }</b></div>
    <div><span>${escapeHtml(labels.date)}</span><b>${escapeHtml(approvedOn || new Date().toLocaleDateString('en-IN'))}</b></div>
  </div>
  <table>
    <thead><tr>
      <th class="c" style="width:28px">#</th><th style="width:80px">${escapeHtml(labels.code)}</th><th>${escapeHtml(labels.material)}</th>
      <th class="c" style="width:44px">${escapeHtml(labels.type)}</th>
      <th class="r" style="width:84px">${escapeHtml(formula ? labels.percent : labels.perPiece)}</th>
      <th class="r" style="width:90px">${escapeHtml(labels.batchQty)}</th><th class="c" style="width:44px">${escapeHtml(labels.unit)}</th>
      <th style="width:120px">${escapeHtml(labels.remark)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    ${
      formula
        ? `<tfoot><tr><td colspan="4" class="r">${escapeHtml(labels.total)}</td><td class="r mono">${formatNumber(totalPercent, 4)} %</td><td class="r mono">${formatNumber(totalQty, 3)}</td><td class="c">${escapeHtml(input.batchUnit)}</td><td></td></tr></tfoot>`
        : ''
    }
  </table>
  <div class="notes"><span>${escapeHtml(labels.notes)}</span>${escapeHtml(input.notes || '—')}</div>
  <div class="stamps">
    <div><span>${escapeHtml(labels.madeBy)}</span>${escapeHtml(input.createdByName ?? '')}</div>
    <div><span>${escapeHtml(labels.approvedBy)}</span>${approved ? `${escapeHtml(input.approvedByName ?? '')} · ${escapeHtml(approvedOn)}` : ''}</div>
    <div><span>${escapeHtml(labels.issuedTo)}</span></div>
  </div>
  <div class="foot"><span>${escapeHtml(labels.printed)} ${escapeHtml(printedOn)}</span><span>${escapeHtml(input.bomCode ?? '')} · v${input.version}</span></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 150) })</script>
</body></html>`
}

export function openPrintSheet(input: PrintSheetInput): boolean {
  const popup = window.open('', '_blank', 'noopener=no,width=900,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildPrintSheetHtml(input))
  popup.document.close()
  return true
}
