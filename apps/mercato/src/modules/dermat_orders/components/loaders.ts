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
  const params = new URLSearchParams({ kinds: 'finished_goods', limit: '20' })
  if (search) params.set('q', search)
  const call = await apiCall<{ items?: Array<{ id: string; title: string; code: string | null; sku: string | null; kind: string; unit: string | null }> }>(
    `/api/dermat_products/search?${params.toString()}`,
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

export async function loadBomStatus(productId: string): Promise<{ id: string; version: number; status: string } | null> {
  const call = await apiCall<{ items?: Array<{ id: string; version: number; status: string }> }>(
    `/api/dermat_boms/boms?productId=${encodeURIComponent(productId)}&pageSize=20`,
    undefined,
    { fallback: { items: [] } },
  )
  const items = (call.result?.items ?? []).filter((item) => item.status !== 'superseded')
  return items.find((item) => item.status === 'approved') ?? items[0] ?? null
}

export async function loadCustomerOrders(customerId: string): Promise<OrderListItem[]> {
  const call = await apiCall<{ items?: OrderListItem[] }>(`/api/dermat_orders/orders?customerId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, {
    fallback: { items: [] },
  })
  return call.result?.items ?? []
}
