import { LETTERHEAD_CSS, esc, letterheadHtml, type PrintCompany } from '../../../cc_ui/lib/printKit'

export type PrintableTc = {
  code: string
  certDate: string
  customerName: string | null
  productLabel: string
  grade: string
  standard: string
  thicknessMm: number | null
  traceability: string | null
  testedBy: string | null
  verifiedBy: string | null
  status: string
  rows: Array<{ property: string; specified: string; unit: string; observed: string; remark: string }>
}

function dotDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.${year.slice(2)}`
}

function cell(value: string): string {
  return esc(value).replace(/\n/g, '<br>')
}

export function buildTcHtml(tc: PrintableTc, company?: PrintCompany | null, forPrint = true): string {
  const head: Array<[string, string]> = [
    ['TC No.', tc.code],
    ['Date', dotDate(tc.certDate)],
    ['Customer', tc.customerName ?? ''],
    ['Product', tc.productLabel],
    ['Grade', tc.grade],
    ['Thickness', tc.thicknessMm === null ? '' : `${tc.thicknessMm.toFixed(1)} MM`],
    ...(tc.traceability ? ([['Traceability', tc.traceability]] as Array<[string, string]>) : []),
  ]
  const rows = tc.rows.map((row) => `<tr><td>${cell(row.property)}</td><td>${cell(row.specified)}</td><td>${cell(row.unit)}</td><td>${cell(row.observed)}</td><td>${esc(row.remark)}</td></tr>`).join('')
  const draft = tc.status !== 'issued'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Test certificate ${esc(tc.code)}</title><style>
*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px;font-size:12px}
${LETTERHEAD_CSS}
h1{text-align:center;font-size:15px;text-decoration:underline;margin:14px 0 14px;letter-spacing:.04em}
.meta td{padding:1px 14px 1px 0} .meta td:first-child{width:90px}
table.tbl{width:100%;border-collapse:collapse;margin-top:14px} .tbl th,.tbl td{border:1px solid #111;padding:8px 6px;text-align:center;vertical-align:middle}
.tbl th{font-weight:700} .tbl td:first-child{white-space:normal}
.sign{display:flex;justify-content:space-between;margin-top:46px;font-size:12px}
.wm{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:80px;color:rgba(0,0,0,.07);transform:rotate(-20deg);font-weight:800}
@media print{body{padding:12mm}}
</style></head><body>
${draft ? '<div class="wm">DRAFT</div>' : ''}
${letterheadHtml(company)}
<h1>TEST CERTIFICATE</h1>
<table class="meta">${head.map(([label, value]) => `<tr><td>${esc(label)}</td><td>– ${esc(value)}</td></tr>`).join('')}</table>
<table class="tbl"><thead><tr><th>Test Properties</th><th>Specified value as per<br>${esc(tc.standard)}</th><th>Unit</th><th>Observed value</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign"><div>Tested By: &nbsp;${esc(tc.testedBy ?? '')}</div><div>Verified By: ${esc(tc.verifiedBy ?? '')}</div></div>
${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>" : ''}
</body></html>`
}

export function printTc(tc: PrintableTc, company?: PrintCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=900,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildTcHtml(tc, company))
  popup.document.close()
  return true
}
