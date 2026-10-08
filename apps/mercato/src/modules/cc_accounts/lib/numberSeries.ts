import type { EntityManager } from '@mikro-orm/postgresql'

export type SeriesKey = 'SO' | 'ENQ' | 'QT' | 'PI' | 'INV' | 'CN' | 'VB' | 'IND' | 'PO' | 'GR' | 'SKU' | 'RB' | 'PB' | 'LOT_BS' | 'LOT_PR' | 'LOT_MO' | 'LOT_CUT' | 'LOT_FG' | 'LOT_BI'

export type SeriesSetting = { prefix: string; suffix: string; pad: number; startAt: number }

export type SeriesDef = SeriesSetting & { key: SeriesKey; label: string; department: string; table: string; column: string; kind?: 'template'; tokens?: string[]; required?: string[]; sample?: Record<string, string> }

export const SERIES_DEFS: SeriesDef[] = [
  { key: 'SO', label: 'Sales order', department: 'Sales', table: 'cc_orders', column: 'order_no', prefix: 'CCCPL/SO/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'ENQ', label: 'Enquiry', department: 'Sales', table: 'cc_enquiries', column: 'enquiry_no', prefix: 'CCCPL/ENQ/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'QT', label: 'Quotation', department: 'Sales', table: 'cc_quotations', column: 'quote_no', prefix: 'CCCPL/QT/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'PI', label: 'Proforma invoice', department: 'Accounts', table: 'cc_proforma_invoices', column: 'code', prefix: 'CCCPL/PI/{FY}/', suffix: '', pad: 3, startAt: 1 },
  { key: 'INV', label: 'Tax invoice', department: 'Accounts', table: 'cc_tax_invoices', column: 'code', prefix: 'CCCPL/INV/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'CN', label: 'Credit note', department: 'Accounts', table: 'cc_tax_invoices', column: 'code', prefix: 'CCCPL/CN/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'VB', label: 'Vendor bill', department: 'Accounts', table: 'cc_vendor_bills', column: 'code', prefix: 'CCCPL/VB/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'IND', label: 'Purchase indent', department: 'Purchase', table: 'cc_purchase_indents', column: 'code', prefix: 'CCCPL/IND/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'PO', label: 'Purchase order', department: 'Purchase', table: 'cc_pos', column: 'code', prefix: 'CCCPL/PO/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'GR', label: 'Goods receiving note', department: 'Store', table: 'cc_grns', column: 'code', prefix: 'CCCPL/GR/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'SKU', label: 'Product SKU', department: 'Masters', table: 'catalog_products', column: 'sku', prefix: 'SKU', suffix: '', pad: 1, startAt: 1 },
  { key: 'RB', label: 'Resin batch No.', department: 'Resin plant', table: 'cc_resin_batches', column: 'batch_no', prefix: 'CCCPL/{DD}{MM}{YY}/', suffix: '', pad: 2, startAt: 1 },
  { key: 'PB', label: 'Press batch No. (gap-free in the month)', department: 'Press & moulding', table: 'cc_press_batches', column: 'batch_no', prefix: 'F/', suffix: '/{MM}/{YYYY}', pad: 2, startAt: 1 },
  { key: 'LOT_BS', label: 'B-stage lot', department: 'Coating', table: '', column: '', kind: 'template', prefix: 'B-{DD}{MM}{YY}-{DRYER}-{SN}', suffix: '', pad: 1, startAt: 1, tokens: ['{DRYER}', '{SN}'], required: ['{DRYER}', '{SN}'], sample: { DRYER: 'D2', SN: '1' } },
  { key: 'LOT_PR', label: 'Pressed lot', department: 'Press & moulding', table: '', column: '', kind: 'template', prefix: '{BATCH} {THICK}mm {GRADE}', suffix: '', pad: 1, startAt: 1, tokens: ['{BATCH}', '{THICK}', '{GRADE}'], required: ['{BATCH}', '{THICK}', '{GRADE}'], sample: { BATCH: 'F/03/10/2026', THICK: '25', GRADE: '10x10' } },
  { key: 'LOT_MO', label: 'Moulded lot', department: 'Press & moulding', table: '', column: '', kind: 'template', prefix: 'M-{DD}{MM}{YY}-S{SHIFT}-P{MACHINE}', suffix: '', pad: 1, startAt: 1, tokens: ['{SHIFT}', '{MACHINE}', '{DIE}'], required: ['{SHIFT}', '{MACHINE}'], sample: { SHIFT: '1', MACHINE: '12', DIE: '1142' } },
  { key: 'LOT_CUT', label: 'Trimmed (cut) lot', department: 'Press & moulding', table: '', column: '', kind: 'template', prefix: '{PARENT} C{N}', suffix: '', pad: 1, startAt: 1, tokens: ['{PARENT}', '{N}'], required: ['{PARENT}', '{N}'], sample: { PARENT: 'F/03/10/2026 25mm 10x10', N: '1' } },
  { key: 'LOT_FG', label: 'Finished (FG) lot', department: 'QC & lab', table: '', column: '', kind: 'template', prefix: 'FG-{DD}{MM}{YY}-{SR} {PARENT}', suffix: '', pad: 1, startAt: 1, tokens: ['{SR}', '{PARENT}'], required: ['{SR}', '{PARENT}'], sample: { SR: '01', PARENT: 'F/03/10/2026 25mm 10x10 C1' } },
  { key: 'LOT_BI', label: 'Bought-in lot', department: 'Store', table: '', column: '', kind: 'template', prefix: 'BI-{DD}{MM}{YY}-{INVOICE}-{ID}', suffix: '', pad: 1, startAt: 1, tokens: ['{INVOICE}', '{ID}'], required: ['{ID}'], sample: { INVOICE: 'INV123', ID: '7F3A' } },
]

export const SERIES_TOKENS = ['{FY}', '{YYYY}', '{YY}', '{MM}', '{DD}'] as const

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

export function renderSeriesText(template: string, date: Date): string {
  return template
    .replace(/\{FY\}/g, financialYear(date))
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{DD\}/g, String(date.getDate()).padStart(2, '0'))
}

export function renderTemplate(template: string, date: Date, values: Record<string, string>): string {
  return renderSeriesText(template, date).replace(/\{([A-Z]+)\}/g, (match, token: string) => (token in values ? values[token] : match))
}

export function seriesDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`)
}

export async function lotCode(scope: Scope, key: SeriesKey, isoDate: string, values: Record<string, string>): Promise<string> {
  const setting = (await loadSeries(scope))[key]
  return renderTemplate(setting.prefix, seriesDate(isoDate), values).trim().slice(0, 118)
}

export function seriesDef(key: SeriesKey): SeriesDef {
  const def = SERIES_DEFS.find((entry) => entry.key === key)
  if (!def) throw new Error(`[internal] unknown number series ${key}`)
  return def
}

export function mergeSeries(stored: unknown): Record<SeriesKey, SeriesSetting> {
  const saved = stored && typeof stored === 'object' ? (stored as Record<string, Partial<SeriesSetting>>) : {}
  const result = {} as Record<SeriesKey, SeriesSetting>
  for (const def of SERIES_DEFS) {
    const own = saved[def.key] ?? {}
    result[def.key] = {
      prefix: typeof own.prefix === 'string' && own.prefix.length ? own.prefix : def.prefix,
      suffix: typeof own.suffix === 'string' ? own.suffix : def.suffix,
      pad: Number.isInteger(own.pad) && Number(own.pad) >= 1 && Number(own.pad) <= 8 ? Number(own.pad) : def.pad,
      startAt: Number.isInteger(own.startAt) && Number(own.startAt) >= 1 ? Number(own.startAt) : def.startAt,
    }
  }
  return result
}

export async function loadSeries(scope: Scope): Promise<Record<SeriesKey, SeriesSetting>> {
  const [row] = await scope.em.getConnection().execute<Array<{ number_series: unknown }>>(
    'select number_series from cc_company_profiles where tenant_id = ? and organization_id = ? limit 1',
    [scope.tenantId, scope.organizationId],
    'all',
    scope.em.getTransactionContext(),
  )
  return mergeSeries(row?.number_series ?? null)
}

export async function lastSeriesNumber(scope: Scope, def: SeriesDef, setting: SeriesSetting, date: Date): Promise<number> {
  if (def.kind === 'template') return 0
  const prefix = renderSeriesText(setting.prefix, date)
  const suffix = renderSeriesText(setting.suffix, date)
  const [row] = await scope.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(middle::bigint) as max from (
       select substring(${def.column} from char_length(?) + 1 for char_length(${def.column}) - char_length(?) - char_length(?)) as middle
         from ${def.table}
        where tenant_id = ? and organization_id = ? and left(${def.column}, char_length(?)) = ? and right(${def.column}, char_length(?)) = ?
     ) as numbers where middle ~ '^[0-9]{1,15}$'`,
    [prefix, prefix, suffix, scope.tenantId, scope.organizationId, prefix, prefix, suffix, suffix],
    'all',
    scope.em.getTransactionContext(),
  )
  return Number(row?.max ?? 0)
}

export function formatSeriesCode(setting: SeriesSetting, value: number, date: Date): string {
  return `${renderSeriesText(setting.prefix, date)}${String(value).padStart(setting.pad, '0')}${renderSeriesText(setting.suffix, date)}`
}

export async function seriesCodeAt(scope: Scope, key: SeriesKey, date: Date, offset: number): Promise<string> {
  const def = seriesDef(key)
  const setting = (await loadSeries(scope))[key]
  const last = await lastSeriesNumber(scope, def, setting, date)
  return formatSeriesCode(setting, Math.max(last + 1, setting.startAt) + offset, date)
}

export async function nextSeriesCode(scope: Scope, key: SeriesKey, date: Date = new Date()): Promise<string> {
  const def = seriesDef(key)
  const setting = (await loadSeries(scope))[key]
  const last = await lastSeriesNumber(scope, def, setting, date)
  return formatSeriesCode(setting, Math.max(last + 1, setting.startAt), date)
}
