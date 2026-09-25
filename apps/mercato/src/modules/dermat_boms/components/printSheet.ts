import type { BomKind } from '../lib/bomKinds'

export type PrintLine = {
  code: string | null
  name: string
  kind: string
  value: number
  quantity: number
  unit: string
  onHand: number
  remark: string
  fillLabel?: string | null
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
  createdAt: string | null
  approvedByName: string | null
  approvedAt: string | null
  labels: Record<string, string>
}

type Section = { key: string; title: string; color: string; lines: PrintLine[] }

const SECTION_ORDER: Array<{ kind: string; titleKey: string; color: string }> = [
  { kind: 'raw_material', titleKey: 'sectionRm', color: '#0284c7' },
  { kind: 'bulk', titleKey: 'sectionBulk', color: '#b45309' },
  { kind: 'packing_material', titleKey: 'sectionPm', color: '#0f766e' },
]

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function formatNumber(value: number, digits: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sectionTable(section: Section, input: PrintSheetInput): string {
  const { labels } = input
  const formula = input.kind === 'formula'
  const valueHeader = formula ? labels.percent : labels.perPiece
  const rows = section.lines
    .map((line, index) => {
      const short = line.quantity > line.onHand
      return `<tr>
        <td class="c muted">${index + 1}</td>
        <td class="mono">${escapeHtml(line.code ?? '—')}</td>
        <td><b>${escapeHtml(line.name)}</b>${line.remark ? `<div class="remark">${escapeHtml(line.remark)}</div>` : ''}</td>
        <td class="r mono">${formula ? `${formatNumber(line.value, 4)}` : formatNumber(line.value, 5)}${
          line.fillLabel ? `<div class="remark">${escapeHtml(line.fillLabel)}</div>` : ''
        }</td>
        <td class="r mono strong">${formatNumber(line.quantity, 3)}</td>
        <td class="c">${escapeHtml(line.unit.toUpperCase())}</td>
        <td class="r mono ${short ? 'short' : ''}">${formatNumber(line.onHand, 3)}</td>
      </tr>`
    })
    .join('')
  const footer =
    formula && section.key === 'raw_material'
      ? `<tfoot><tr>
          <td colspan="3" class="r">${escapeHtml(labels.total)}</td>
          <td class="r mono">${formatNumber(
            section.lines.reduce((sum, line) => sum + line.value, 0),
            4,
          )}</td>
          <td colspan="3"></td>
        </tr></tfoot>`
      : ''
  return `<section>
    <h3 style="color:${section.color}">${escapeHtml(section.title)} <span class="count">(${section.lines.length})</span></h3>
    <table>
      <thead style="background:${section.color}"><tr>
        <th class="c" style="width:26px">#</th>
        <th style="width:78px">${escapeHtml(labels.code)}</th>
        <th>${escapeHtml(labels.component)}</th>
        <th class="r" style="width:78px">${escapeHtml(valueHeader)}</th>
        <th class="r" style="width:96px">${escapeHtml(labels.batchQty)}</th>
        <th class="c" style="width:44px">${escapeHtml(labels.uom)}</th>
        <th class="r" style="width:84px">${escapeHtml(labels.onHand)}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      ${footer}
    </table>
  </section>`
}

export function buildPrintSheetHtml(input: PrintSheetInput): string {
  const { labels } = input
  const formula = input.kind === 'formula'
  const sections: Section[] = SECTION_ORDER.map((entry) => ({
    key: entry.kind,
    title: labels[entry.titleKey],
    color: entry.color,
    lines: input.lines.filter((line) => line.kind === entry.kind),
  })).filter((section) => section.lines.length)
  const others = input.lines.filter((line) => !SECTION_ORDER.some((entry) => entry.kind === line.kind))
  if (others.length) sections.push({ key: 'other', title: labels.sectionOther, color: '#475569', lines: others })
  const approved = input.status === 'approved'
  const infoRows: Array<[string, string]> = [
    [labels.productName, input.productName],
    [labels.productCode, input.productCode ?? '—'],
    [labels.bomNo, `${input.bomCode ?? '—'}  ·  v${input.version}`],
    [labels.quantity, `${formatNumber(input.batchSize, 3)} ${input.batchUnit.toUpperCase()}`],
  ]
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(`${input.bomCode ?? 'BOM'} - ${input.productName}`)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; font-size: 11px; margin: 0; padding: 28px; background: #fff; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid #0f172a; }
  .info { display: grid; grid-template-columns: 120px 1fr; gap: 3px 10px; font-size: 12.5px; }
  .info dt { font-weight: 700; color: #334155; }
  .info dd { margin: 0; font-weight: 700; }
  .info dd.name { text-transform: uppercase; }
  .company { text-align: right; }
  .company .brand { font-size: 20px; font-weight: 800; letter-spacing: 0.06em; }
  .company .doc { margin-top: 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
  .company .meta { margin-top: 8px; font-size: 10px; color: #475569; line-height: 1.5; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; border: 1.5px solid; }
  .badge.approved { color: #15803d; border-color: #15803d; }
  .badge.draft { color: #b45309; border-color: #b45309; border-style: dashed; }
  .badge.superseded { color: #64748b; border-color: #64748b; }
  section { margin-top: 18px; page-break-inside: auto; }
  h3 { margin: 0 0 6px; font-size: 13px; font-weight: 800; }
  h3 .count { color: #94a3b8; font-weight: 600; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead { color: #fff; }
  th { padding: 6px 7px; font-size: 10px; font-weight: 700; text-align: left; border: 1px solid rgba(0,0,0,0.15); }
  td { padding: 6px 7px; border: 1px solid #cbd5e1; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { font-weight: 800; background: #f1f5f9; }
  tr { page-break-inside: avoid; }
  .c { text-align: center; } .r { text-align: right; } .strong { font-weight: 800; } .muted { color: #64748b; }
  .mono { font-family: "SFMono-Regular", Menlo, Consolas, monospace; }
  .remark { margin-top: 2px; font-size: 9.5px; color: #64748b; font-weight: 400; }
  .short { color: #b91c1c; font-weight: 700; }
  .summary { display: flex; gap: 10px; margin-top: 14px; }
  .summary div { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; }
  .summary span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .summary b { font-size: 13px; }
  .notes { margin-top: 18px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px 10px; min-height: 52px; white-space: pre-wrap; }
  .notes span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
  .stamps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 34px; }
  .stamps div { border-top: 1px solid #0f172a; padding-top: 5px; min-height: 34px; font-weight: 700; }
  .stamps span { display: block; font-size: 9px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 9px; display: flex; justify-content: space-between; }
  .watermark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: 900; color: rgba(180, 83, 9, 0.07); transform: rotate(-24deg); pointer-events: none; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  ${approved ? '' : `<div class="watermark">${escapeHtml(input.status === 'superseded' ? labels.watermarkOld : labels.watermark)}</div>`}
  <div class="top">
    <dl class="info">
      ${infoRows.map(([label, value], index) => `<dt>${escapeHtml(label)}:</dt><dd class="${index === 0 ? 'name' : ''}">${escapeHtml(value)}</dd>`).join('')}
    </dl>
    <div class="company">
      <div class="brand">DERMAT INDIA</div>
      <div class="doc">${escapeHtml(formula ? labels.formulaTitle : labels.packTitle)}</div>
      <div class="badge ${escapeHtml(input.status)}">${escapeHtml(labels[`status_${input.status}`] ?? input.status)}</div>
      <div class="meta">
        ${input.createdAt ? `${escapeHtml(labels.createdOn)}: ${escapeHtml(formatDate(input.createdAt))}<br>` : ''}
        ${approved && input.approvedAt ? `${escapeHtml(labels.approvedOn)}: ${escapeHtml(formatDate(input.approvedAt))}` : ''}
      </div>
    </div>
  </div>

  <div class="summary">
    <div><span>${escapeHtml(labels.components)}</span><b>${input.lines.length}</b></div>
    ${
      formula
        ? `<div><span>${escapeHtml(labels.totalPercent)}</span><b>${formatNumber(input.lines.reduce((sum, line) => sum + line.value, 0), 4)} %</b></div>`
        : `<div><span>${escapeHtml(labels.bulkPerPiece)}</span><b>${formatNumber(
            input.lines.filter((line) => line.kind === 'bulk').reduce((sum, line) => sum + line.value, 0),
            5,
          )}</b></div>`
    }
    <div><span>${escapeHtml(labels.batch)}</span><b>${formatNumber(input.batchSize, 3)} ${escapeHtml(input.batchUnit.toUpperCase())}</b></div>
    <div><span>${escapeHtml(labels.shortItems)}</span><b>${input.lines.filter((line) => line.quantity > line.onHand).length}</b></div>
  </div>

  ${sections.map((section) => sectionTable(section, input)).join('')}

  <div class="notes"><span>${escapeHtml(labels.notes)}</span>${escapeHtml(input.notes || '—')}</div>
  <div class="stamps">
    <div><span>${escapeHtml(labels.madeBy)}</span>${escapeHtml(input.createdByName ?? '')}</div>
    <div><span>${escapeHtml(labels.approvedBy)}</span>${approved ? escapeHtml(input.approvedByName ?? '') : ''}</div>
    <div><span>${escapeHtml(labels.issuedTo)}</span></div>
  </div>
  <div class="foot"><span>${escapeHtml(labels.printed)} ${escapeHtml(formatDate(new Date().toISOString()))}</span><span>${escapeHtml(input.bomCode ?? '')} · v${input.version}</span></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
</body></html>`
}

export function openPrintSheet(input: PrintSheetInput): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildPrintSheetHtml(input))
  popup.document.close()
  return true
}
