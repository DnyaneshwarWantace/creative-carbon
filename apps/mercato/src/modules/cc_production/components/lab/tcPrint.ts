import { LETTERHEAD_CSS, esc, letterheadHtml, type PrintCompany } from '../../../cc_ui/lib/printKit'
import { REVISION_CSS, revisionTag, supersededBlock, type RevisionPrint } from '../../../cc_ui/lib/printRevision'
import type { Certificate } from '../../lib/testCertificate'

function shortDate(value: string | null | undefined): string {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}.${month}.${year.slice(-2)}`
}

function signedAs(name: string, role: string): string {
  const [person, title] = name.split(',').map((part) => part.trim())
  return person ? `${esc(person)} (${esc(title || role)})` : ''
}

export function buildTcHtml(input: { certificate: Certificate; testDate: string } & RevisionPrint, company: PrintCompany | null | undefined, forPrint = true): string {
  const tc = input.certificate
  const criteria = tc.lastColumn === 'criteria'
  const head = (label: string, value: string) => (value ? `<tr><td class="hk">${label}</td><td class="hd">–</td><td class="hv">${esc(value)}</td></tr>` : '')
  const rows = tc.rows
    .map((item) => `<tr><td class="prop">${esc(item.property)}${item.condition ? `<div class="cond">${esc(item.condition)}</div>` : ''}</td><td class="c">${esc(item.specified)}</td><td class="c">${esc(item.unit)}</td><td class="c">${esc(item.observed)}</td><td class="c${!criteria && item.remark === 'NOT OK' ? ' bad' : ''}">${esc(criteria ? item.criteria : item.remark)}</td></tr>`)
    .join('')
  const legend = tc.legend.length
    ? `<table class="legend"><tr><th colspan="5">Test Criteria</th></tr>${tc.legend.map((item) => `<tr><td class="c b">${esc(item.code)}</td><td class="c">${esc(item.a)}</td><td class="c">${esc(item.b)}</td><td class="c">${esc(item.c)}</td><td class="c b">${esc(item.result)}</td></tr>`).join('')}</table>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Test certificate ${esc(tc.tcNo)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
    .page{width:194mm;margin:0 auto;padding:8mm 0}
    ${LETTERHEAD_CSS}
    ${REVISION_CSS}
    h1{text-align:center;font-size:18px;letter-spacing:.08em;margin:16px 0 14px;text-decoration:underline}
    table.head{margin:0 0 14px 6px;font-size:12.5px} .hk{font-weight:700;width:170px;padding:2px 0} .hd{width:22px} .hv{font-weight:700}
    table.tc{width:100%;border-collapse:collapse}
    table.tc th,table.tc td{border:1px solid #222;padding:5px 6px;vertical-align:middle}
    table.tc th{font-size:11.5px}
    .prop{font-weight:600}.cond{font-weight:400;font-size:10.5px}
    .c{text-align:center}.b{font-weight:700}.bad{font-weight:700;text-decoration:underline}
    table.legend{width:100%;border-collapse:collapse;margin-top:12px;font-size:10.5px}
    table.legend th,table.legend td{border:1px solid #222;padding:3px 5px}
    .sign{display:flex;justify-content:space-between;margin-top:46px;font-weight:700}
    @media print{@page{size:A4;margin:8mm}.page{padding:0}}
  </style></head><body><div class="page">${supersededBlock(input)}
  ${letterheadHtml(company)}
  <h1>TEST CERTIFICATE ${revisionTag(input)}</h1>
  <table class="head">${head('TC No.', tc.tcNo)}${head('Production Traceability', tc.traceability)}${head('Date', shortDate(input.testDate))}${head('Customer', tc.customer)}${head('Product', tc.product)}${head('Grade', tc.grade)}${head('Thickness', tc.thickness)}</table>
  <table class="tc">
    <colgroup><col style="width:30%"><col style="width:20%"><col style="width:14%"><col style="width:17%"><col style="width:19%"></colgroup>
    <thead><tr><th>Test Properties</th><th>Specified value as per<br>${esc(tc.standard)}</th><th>Unit</th><th>Observed value</th><th>${criteria ? 'Test Criteria' : 'Remark'}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${legend}
  <div class="sign"><span>${tc.testedBy ? `Tested By: ${signedAs(tc.testedBy, 'Laboratory Department')}` : ''}</span><span>${tc.verifiedBy ? `Verified By: ${signedAs(tc.verifiedBy, 'Director')}` : ''}</span></div>
  </div>${forPrint ? "<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 250) })</script>" : "<script>function fit(){var page=document.querySelector('.page');if(!page)return;document.body.style.zoom='';document.body.style.zoom=String(Math.min(1,(window.innerWidth-12)/page.offsetWidth))}window.addEventListener('load',fit);window.addEventListener('resize',fit)</script>"}
  </body></html>`
}

export function printTc(input: { certificate: Certificate; testDate: string } & RevisionPrint, company: PrintCompany | null | undefined): boolean {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  popup.document.open()
  popup.document.write(buildTcHtml(input, company))
  popup.document.close()
  return true
}
