import type { EntityManager } from '@mikro-orm/postgresql'

export type SeriesKey = 'SO' | 'PI' | 'INV' | 'CN' | 'VB' | 'IND' | 'PO' | 'GR' | 'QC' | 'QR' | 'MR' | 'PL' | 'RD' | 'SKU'

export type SeriesSetting = { prefix: string; suffix: string; pad: number; startAt: number }

export type SeriesDef = SeriesSetting & { key: SeriesKey; label: string; department: string; table: string; column: string }

export const SERIES_DEFS: SeriesDef[] = [
  { key: 'SO', label: 'Sales order', department: 'Sales', table: 'dermat_orders', column: 'order_no', prefix: 'DER/SO/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'PI', label: 'Proforma invoice', department: 'Accounts', table: 'dermat_proforma_invoices', column: 'code', prefix: 'DI/PI/{FY}/', suffix: '', pad: 3, startAt: 1 },
  { key: 'INV', label: 'Tax invoice', department: 'Accounts', table: 'dermat_tax_invoices', column: 'code', prefix: 'DI/INV/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'CN', label: 'Credit note', department: 'Accounts', table: 'dermat_tax_invoices', column: 'code', prefix: 'DI/CN/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'VB', label: 'Vendor bill', department: 'Accounts', table: 'dermat_vendor_bills', column: 'code', prefix: 'DER/VB/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'IND', label: 'Purchase indent', department: 'Purchase', table: 'dermat_purchase_indents', column: 'code', prefix: 'DER/IND/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'PO', label: 'Purchase order', department: 'Purchase', table: 'dermat_pos', column: 'code', prefix: 'DER/PO/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'GR', label: 'Goods receiving note', department: 'Store', table: 'dermat_grns', column: 'code', prefix: 'DER/GR/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'MR', label: 'Store request', department: 'Store', table: 'dermat_store_requests', column: 'code', prefix: 'DER/MR/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'QC', label: 'Quality check', department: 'QC', table: 'dermat_quality_checks', column: 'code', prefix: 'DER/QC/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'QR', label: 'Quality rule', department: 'QC', table: 'dermat_quality_rules', column: 'code', prefix: 'DER/QR/{FY}/', suffix: '', pad: 3, startAt: 1 },
  { key: 'PL', label: 'Material plan', department: 'Planning', table: 'dermat_planning_plans', column: 'code', prefix: 'DER/PL/{FY}/', suffix: '', pad: 3, startAt: 1 },
  { key: 'RD', label: 'R&D request', department: 'R&D', table: 'dermat_rnd_requests', column: 'code', prefix: 'DER/RD/{FY}/', suffix: '', pad: 4, startAt: 1 },
  { key: 'SKU', label: 'Product SKU', department: 'Masters', table: 'catalog_products', column: 'sku', prefix: 'SKU', suffix: '', pad: 1, startAt: 1 },
]

export const SERIES_TOKENS = ['{FY}', '{YYYY}', '{YY}', '{MM}'] as const

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
    'select number_series from dermat_company_profiles where tenant_id = ? and organization_id = ? limit 1',
    [scope.tenantId, scope.organizationId],
    'all',
    scope.em.getTransactionContext(),
  )
  return mergeSeries(row?.number_series ?? null)
}

export async function lastSeriesNumber(scope: Scope, def: SeriesDef, setting: SeriesSetting, date: Date): Promise<number> {
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

export async function nextSeriesCode(scope: Scope, key: SeriesKey, date: Date = new Date()): Promise<string> {
  const def = seriesDef(key)
  const setting = (await loadSeries(scope))[key]
  const last = await lastSeriesNumber(scope, def, setting, date)
  return formatSeriesCode(setting, Math.max(last + 1, setting.startAt), date)
}
