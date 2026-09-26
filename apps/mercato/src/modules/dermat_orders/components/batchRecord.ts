import { stageDef } from '../lib/stages'
import { companyHeader, type DocCompany } from './printDocs'

type BatchPrint = {
  batchNo: string
  orders: Array<{ orderNo: string; customer: string | null }>
  products: Array<{ title: string; code: string | null; quantity: number }>
  mfgDate: string | null
  bulkKg: number | null
  wastageKg: number | null
  shift: string | null
  vessel: string | null
  operator: string | null
  filled: number | null
  rejectedUnits: number | null
  packed: number | null
  qa: { result: string | null; releasedOn: string | null; coaNo: string | null; retentionQty: number | null; retentionLocation: string | null }
  steps: Array<{ key: string; status: string; completedAt: string | null; completedByName: string | null; fields: Record<string, unknown> }>
  materials: Array<{ stageKey: string; requestCode: string; title: string; code: string | null; unit: string; required: number; issued: number; used: number; returned: number; lots: Array<{ lotNumber: string | null; quantity: number }> }>
  checks: Array<{ arNo: string | null; code: string; stageKey: string | null; status: string; chemicalStatus: string; microStatus: string }>
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function day(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function buildBatchRecordHtml(batch: BatchPrint, company: DocCompany | null): string {
  const field = (key: string, name: string) => {
    const value = batch.steps.find((step) => step.key === key)?.fields[name]
    return value === undefined || value === null || value === '' ? '—' : esc(value)
  }
  const stepRows = batch.steps
    .map((step) => {
      const def = stageDef(step.key)
      const values = (def?.fields ?? [])
        .filter((entry) => entry.type !== 'textarea' && step.fields[entry.key] !== undefined && step.fields[entry.key] !== '')
        .map((entry) => `${esc(entry.label)}: <b>${entry.type === 'date' ? day(step.fields[entry.key]) : esc(step.fields[entry.key])}</b>`)
        .join(' · ')
      return `<tr><td>${esc(def?.label ?? step.key)}</td><td>${esc(step.status)}</td><td>${values || '—'}</td><td>${esc(step.completedByName ?? '')}<div class="muted">${step.completedAt ? day(step.completedAt) : ''}</div></td><td class="sig"></td></tr>`
    })
    .join('')
  const materialRows = batch.materials
    .map((material) => `<tr><td>${esc(stageDef(material.stageKey)?.label ?? material.stageKey)}<div class="mono">${esc(material.requestCode)}</div></td><td>${esc(material.title)}<div class="mono">${esc(material.code ?? '')}</div></td><td class="mono">${material.lots.map((lot) => `${esc(lot.lotNumber ?? '—')} (${num(lot.quantity)})`).join('<br>') || '—'}</td><td class="r">${num(material.required)} ${esc(material.unit)}</td><td class="r">${num(material.issued)}</td><td class="r">${num(material.used)}</td><td class="r">${num(material.returned)}</td><td class="sig"></td></tr>`)
    .join('')
  const checkRows = batch.checks
    .map((check) => `<tr><td class="mono">${esc(check.arNo ?? check.code)}</td><td>${esc(check.stageKey ? stageDef(check.stageKey)?.label ?? check.stageKey : '')}</td><td>${esc(check.chemicalStatus)}</td><td>${esc(check.microStatus)}</td><td><b>${esc(check.status)}</b></td></tr>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Batch record ${esc(batch.batchNo)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:28px;font-size:11px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1c1917;padding-bottom:12px}
    h1{font-size:18px;margin:0} h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 6px;color:#44403c}
    .muted{color:#78716c;font-size:10px} .mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    .doc{text-align:right} .doc .no{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px} .cell{border:1px solid #d6d3d1;border-radius:4px;padding:6px 8px} .cell b{display:block;font-size:12px}
    table{width:100%;border-collapse:collapse} th{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:5px}
    td{padding:6px 5px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .sig{width:90px}
    .signs{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px} .signs div{border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:12mm}}
  </style></head><body>
  <div class="top">${companyHeader(company, 'Batch manufacturing record')}<div class="doc"><div class="muted">BATCH MANUFACTURING RECORD</div><div class="no">${esc(batch.batchNo)}</div><div class="muted">${batch.orders.map((order) => `${esc(order.orderNo)}${order.customer ? ` · ${esc(order.customer)}` : ''}`).join('<br>')}</div></div></div>
  <div class="grid">
    <div class="cell"><span class="muted">Product</span><b>${batch.products.map((product) => esc(product.title)).join(', ')}</b></div>
    <div class="cell"><span class="muted">Mfg. date</span><b>${day(batch.mfgDate)}</b></div>
    <div class="cell"><span class="muted">Bulk made</span><b>${num(batch.bulkKg)} kg</b></div>
    <div class="cell"><span class="muted">Wastage</span><b>${num(batch.wastageKg)} kg</b></div>
    <div class="cell"><span class="muted">Vessel</span><b>${esc(batch.vessel ?? '—')}</b></div>
    <div class="cell"><span class="muted">Operator / shift</span><b>${esc(batch.operator ?? '—')} / ${esc(batch.shift ?? '—')}</b></div>
    <div class="cell"><span class="muted">Started / finished</span><b>${field('manufacturing', 'start_time')} – ${field('manufacturing', 'end_time')}</b></div>
    <div class="cell"><span class="muted">Filled / rejected / packed</span><b>${num(batch.filled)} / ${num(batch.rejectedUnits)} / ${num(batch.packed)}</b></div>
  </div>
  <h2>Materials issued and used</h2>
  <table><thead><tr><th>Step</th><th>Material</th><th>Lot (qty)</th><th class="r">Needed</th><th class="r">Issued</th><th class="r">Used</th><th class="r">Returned</th><th>Checked by</th></tr></thead><tbody>${materialRows || '<tr><td colspan="8" class="muted">No store issue recorded</td></tr>'}</tbody></table>
  <h2>Production steps</h2>
  <table><thead><tr><th>Step</th><th>Status</th><th>Recorded</th><th>Done by</th><th>Verified by</th></tr></thead><tbody>${stepRows}</tbody></table>
  <h2>Quality control</h2>
  <table><thead><tr><th>AR no.</th><th>Step</th><th>Chemical</th><th>Micro</th><th>Result</th></tr></thead><tbody>${checkRows || '<tr><td colspan="5" class="muted">No QC checks</td></tr>'}</tbody></table>
  <h2>QA release</h2>
  <div class="grid"><div class="cell"><span class="muted">Decision</span><b>${esc(batch.qa.result ?? 'Pending')}</b></div><div class="cell"><span class="muted">Released on</span><b>${day(batch.qa.releasedOn)}</b></div><div class="cell"><span class="muted">COA no.</span><b>${esc(batch.qa.coaNo ?? '—')}</b></div><div class="cell"><span class="muted">Retention sample</span><b>${num(batch.qa.retentionQty)} ${batch.qa.retentionLocation ? `· ${esc(batch.qa.retentionLocation)}` : ''}</b></div></div>
  <div class="signs"><div>Production</div><div>Quality control</div><div>Quality assurance</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

export function printBatchRecord(batch: BatchPrint, company: DocCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=1000,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildBatchRecordHtml(batch, company))
  popup.document.close()
  return true
}
