import { DEFAULT_LETTERHEAD, type LetterheadView } from '../../cc_accounts/lib/letterhead'

export type PrintCompany = {
  name: string
  legalName?: string | null
  gstin?: string | null
  pan?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccount?: string | null
  bankIfsc?: string | null
  signatory?: string | null
  letterhead?: LetterheadView | null
}

export function partyLogoHtml(url: string | null | undefined): string {
  return url && url.startsWith('data:image/') ? `<img class="plogo" src="${esc(url)}" alt="" style="display:block;max-height:34px;max-width:130px;margin:0 0 4px;object-fit:contain">` : ''
}

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

export function lines(value: string | null | undefined): string {
  return esc(value ?? '').replace(/\n/g, '<br>')
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(value: number): string {
  if (value < 20) return ONES[value]
  return [TENS[Math.floor(value / 10)], ONES[value % 10]].filter(Boolean).join(' ')
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

export function indianWords(whole: number): string {
  if (whole === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(whole / 10_000_000)
  const lakh = Math.floor((whole % 10_000_000) / 100_000)
  const thousand = Math.floor((whole % 100_000) / 1000)
  const rest = whole % 1000
  if (crore) parts.push(`${crore >= 100 ? indianWords(crore) : belowHundred(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

export function amountInWords(value: number, currency = 'INR'): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100
  const whole = Math.floor(rounded)
  const paise = Math.round((rounded - whole) * 100)
  const minor = currency === 'INR' ? 'Paise' : 'Cents'
  return `${currency} ${indianWords(whole)}${paise ? ` and ${belowHundred(paise)} ${minor}` : ''} Only`
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function qty(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 3 }).format(value)
}

export function tallyDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]
  return `${date.getDate()}-${month}-${String(date.getFullYear()).slice(-2)}`
}

export function dotDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
}

export type HsnLine = { hsn: string | null; taxable: number; gstPercent: number; cgst?: number; sgst?: number; igst?: number }
export type HsnRow = { hsn: string; taxable: number; rate: number; cgst: number; sgst: number; igst: number; tax: number }

export function hsnSummary(items: HsnLine[], interState: boolean): HsnRow[] {
  const rows = new Map<string, HsnRow>()
  for (const item of items) {
    const hsn = item.hsn || '—'
    const key = `${hsn}|${item.gstPercent}`
    const row = rows.get(key) ?? { hsn, taxable: 0, rate: item.gstPercent, cgst: 0, sgst: 0, igst: 0, tax: 0 }
    const tax = (item.taxable * item.gstPercent) / 100
    row.taxable += item.taxable
    if (interState) row.igst += item.igst ?? tax
    else {
      row.cgst += item.cgst ?? tax / 2
      row.sgst += item.sgst ?? tax / 2
    }
    rows.set(key, row)
  }
  return [...rows.values()].map((row) => {
    const round = (value: number) => Math.round(value * 100) / 100
    const cgst = round(row.cgst)
    const sgst = round(row.sgst)
    const igst = round(row.igst)
    return { ...row, taxable: round(row.taxable), cgst, sgst, igst, tax: round(cgst + sgst + igst) }
  })
}

export const COPY_LABELS = {
  original: 'ORIGINAL FOR RECIPIENT',
  duplicate: 'DUPLICATE FOR TRANSPORTER',
  triplicate: 'TRIPLICATE FOR SUPPLIER',
  extra: 'EXTRA COPY',
} as const

export type CopyKind = keyof typeof COPY_LABELS

export function absoluteUrl(url: string, origin?: string): string {
  if (!url.startsWith('/')) return url
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${url}`
}

export function letterheadOf(company: PrintCompany | null | undefined): LetterheadView {
  return company?.letterhead ?? DEFAULT_LETTERHEAD
}

function splitName(name: string): [string, string] {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean)
  if (words.length <= 2) return [words.join(' '), '']
  return [words.slice(0, 2).join(' '), words.slice(2).join(' ')]
}

export const LETTERHEAD_CSS = `
.lh{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:14px;padding-bottom:6px}
.lh .badges{display:flex;flex-direction:column;align-items:center;gap:2px}
.lh .badges img{height:58px}
.lh .logo{height:92px}
.lh .nm1,.lh .nm2{font-family:'Century Gothic','Futura','Avenir Next','Trebuchet MS',sans-serif;color:#3b3a4a;line-height:1.02;letter-spacing:0.01em}
.lh .nm1{font-size:27px}
.lh .nm2{font-size:27px}
.lh .rule{border-top:1.5px dashed #d9472b;margin:4px 0 3px}
.lh .addr{color:#d9472b;font-size:10.5px;line-height:1.35}
.lh .mail{color:#2b2b38;font-size:10.5px;line-height:1.35}
.lh .ids{color:#4a4a55;font-size:10.5px;margin-top:3px}
`

export function letterheadHtml(company: PrintCompany | null | undefined, origin?: string): string {
  const lh = letterheadOf(company)
  const [first, second] = splitName(company?.name || 'Creative Carbon Composites Pvt. Ltd.')
  const phone = [company?.phone ? `PH. : ${company.phone}` : '', lh.mobile ? `Mobile : ${lh.mobile}` : ''].filter(Boolean).join('  ')
  const mails = [lh.email2 ? lh.email2 : '', company?.email ?? ''].filter(Boolean).join('  •  ')
  const ids = [lh.cin ? `CIN ${lh.cin}` : '', company?.gstin ? `GSTIN : ${company.gstin}` : ''].filter(Boolean).join('  •  ')
  const badges = lh.showBadges
    ? `<div class="badges"><img src="${esc(absoluteUrl(lh.badgesUrl, origin))}" alt="ISO certified"></div>`
    : '<div></div>'
  return `<div class="lh">${badges}<img class="logo" src="${esc(absoluteUrl(lh.logoUrl, origin))}" alt="Logo"><div><div class="nm1">${esc(first)}</div>${second ? `<div class="nm2">${esc(second)}</div>` : ''}<div class="rule"></div><div class="addr">${esc(lh.letterheadAddress || company?.address || '')}${phone ? `<br>${esc(phone)}` : ''}</div>${mails ? `<div class="mail">E-MAIL : ${esc(mails)}</div>` : ''}${company?.website ? `<div class="mail">WEBSITE : ${esc(company.website)}</div>` : ''}${ids ? `<div class="ids">${esc(ids)}</div>` : ''}</div></div>`
}
