import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { PickerOption } from './SearchPicker'
import { readable } from './format'
import type { Customer, OrderListItem, ProductInfo } from './types'

type CompanyRow = Record<string, unknown> & { id: string }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function customerFromRow(row: CompanyRow): Customer {
  return {
    id: row.id,
    name: readable(row.display_name) ?? text(row.cf_legal_trade_name) ?? '(no name)',
    gstin: text(row.cf_gstin) ?? text(row.cf_gst_number),
    paymentTerms: text(row.cf_payment_terms),
    paymentRemarks: text(row.cf_payment_remarks),
    salesManager: text(row.cf_sales_manager),
    phone: readable(row.primary_phone),
    email: readable(row.primary_email),
  }
}

export async function searchCustomers(search: string): Promise<PickerOption<Customer>[]> {
  const params = new URLSearchParams({ page: '1', pageSize: '20', sortField: 'createdAt', sortDir: 'desc' })
  if (search) params.set('search', search)
  const call = await apiCall<{ items?: CompanyRow[] }>(`/api/customers/companies?${params.toString()}`, undefined, { fallback: { items: [] } })
  return (call.result?.items ?? []).map((row) => {
    const customer = customerFromRow(row)
    return { id: customer.id, primary: customer.name, secondary: customer.gstin ? `GSTIN ${customer.gstin}` : null, value: customer }
  })
}

export async function loadCustomer(id: string): Promise<Customer | null> {
  const call = await apiCall<{ items?: CompanyRow[] }>(`/api/customers/companies?id=${encodeURIComponent(id)}&pageSize=1`, undefined, {
    fallback: { items: [] },
  })
  const row = call.result?.items?.[0]
  return row ? customerFromRow(row) : null
}

export async function searchFinishedGoods(search: string): Promise<PickerOption<ProductInfo>[]> {
  const params = new URLSearchParams({ limit: '20' })
  if (search) params.set('q', search)
  const call = await apiCall<{ items?: Array<{ id: string; title: string; code: string | null; sku: string | null; kind: string; unit: string | null }> }>(
    `/api/cc_products/search?${params.toString()}`,
    undefined,
    { fallback: { items: [] } },
  )
  return (call.result?.items ?? []).map((item) => ({
    id: item.id,
    primary: item.title,
    tag: item.code,
    secondary: item.sku,
    value: { id: item.id, title: item.title, code: item.code, sku: item.sku, kind: item.kind, unit: item.unit, packSize: null, brandName: null, mrp: null },
  }))
}

export async function loadProductDetails(id: string): Promise<Pick<ProductInfo, 'packSize' | 'brandName' | 'mrp'>> {
  const call = await apiCall<{ items?: Array<Record<string, unknown>> }>(`/api/catalog/products?id=${encodeURIComponent(id)}&pageSize=1`, undefined, {
    fallback: { items: [] },
  })
  const item = call.result?.items?.[0] ?? {}
  const custom = (item.customFields ?? {}) as Record<string, unknown>
  const pick = (key: string) => item[`cf_${key}`] ?? custom[key] ?? null
  const mrp = pick('mrp')
  return {
    packSize: text(pick('pack_size')),
    brandName: text(pick('brand_name')),
    mrp: mrp === null || mrp === '' || mrp === undefined ? null : Number(mrp),
  }
}

export async function loadCustomerOrders(customerId: string): Promise<OrderListItem[]> {
  const call = await apiCall<{ items?: OrderListItem[] }>(`/api/cc_orders/orders?customerId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, {
    fallback: { items: [] },
  })
  return call.result?.items ?? []
}

export type CustomerAddress = { id: string; purpose: string | null; text: string }

function plainText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/.test(value) ? '' : value.trim()
}

export async function loadAddresses(customerId: string): Promise<CustomerAddress[]> {
  const call = await apiCall<{ items?: Array<Record<string, unknown>> }>(`/api/customers/addresses?entityId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, { fallback: { items: [] } })
  return (call.result?.items ?? [])
    .map((row) => {
      const parts = [plainText(row.address_line1), plainText(row.address_line2), plainText(row.city), [plainText(row.region), plainText(row.postal_code)].filter(Boolean).join(' '), plainText(row.country)].filter(Boolean)
      return { id: String(row.id), purpose: typeof row.purpose === 'string' ? row.purpose : null, text: parts.join(', ') }
    })
    .filter((entry) => entry.text)
}

export type ProductSpecs = { unit: string | null; kind: string | null; specs: Record<string, string> }

const SPEC_FROM_PRODUCT: Record<string, string> = {
  product_form: 'form',
  laminate_grade: 'grade',
  weave: 'weave',
  thickness_mm: 'thickness_mm',
  sheet_size: 'sheet_size',
  die_no: 'die_no',
}

export async function loadProductSpecs(id: string): Promise<ProductSpecs> {
  const call = await apiCall<{ items?: Array<Record<string, unknown>> }>(`/api/catalog/products?id=${encodeURIComponent(id)}&pageSize=1`, undefined, { fallback: { items: [] } })
  const item = call.ok ? (call.result?.items?.[0] ?? {}) : {}
  const custom = (item.customFields ?? {}) as Record<string, unknown>
  const pick = (key: string) => {
    const value = item[`cf_${key}`] ?? custom[key]
    return value === null || value === undefined ? '' : String(value).trim()
  }
  const specs: Record<string, string> = {}
  for (const [from, to] of Object.entries(SPEC_FROM_PRODUCT)) {
    const value = pick(from)
    if (value) specs[to] = value
  }
  const standard = pick('test_standard')
  return { unit: pick('default_unit') || null, kind: pick('item_type') || null, specs: { ...specs, ...(standard ? { __test_standard: standard } : {}) } }
}
