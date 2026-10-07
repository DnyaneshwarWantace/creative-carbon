import type { EntityManager } from '@mikro-orm/postgresql'

export type StockScope = { em: EntityManager; tenantId: string; organizationId: string }

export const STORES = [
  { key: 'wh_a', code: 'WH-A', label: 'Warehouse A', receives: true },
  { key: 'wh_b', code: 'WH-B', label: 'Warehouse B', receives: true },
  { key: 'tank', code: 'RESIN-TANK', label: 'Resin tank', receives: false },
  { key: 'floor', code: 'SHOP-FLOOR', label: 'Shop floor', receives: false },
  { key: 'fg', code: 'FG-STORE', label: 'FG store', receives: true },
] as const

export type StockPlace = (typeof STORES)[number]['key']

export const LOCATION_CODES = Object.fromEntries(STORES.map((store) => [store.key, store.code])) as Record<StockPlace, string>

export const PLACE_LABEL = Object.fromEntries(STORES.map((store) => [store.key, store.label])) as Record<StockPlace, string>

export const STOCK_PLACES = STORES.map((store) => store.key) as [StockPlace, ...StockPlace[]]

export type StoreKey = 'wh_a' | 'wh_b' | 'fg'

export const RECEIVING_STORES = STORES.filter((store) => store.receives).map((store) => store.key) as StoreKey[]

export function receivingStoreFor(kind: string | null): StoreKey {
  return kind === 'laminate' || kind === 'moulded' || kind === 'bstage' ? 'fg' : 'wh_a'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuids(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
}

function run<T extends Array<Record<string, unknown>>>(scope: StockScope, sql: string, params: unknown[]): Promise<T> {
  return scope.em.getConnection().execute<T>(sql, params, 'all', scope.em.getTransactionContext())
}

export async function ccWarehouse(scope: StockScope): Promise<{ warehouseId: string; locations: Map<string, string> } | null> {
  const rows = await run<Array<{ warehouse_id: string; id: string; code: string }>>(
    scope,
    `select l.warehouse_id, l.id, l.code from wms_warehouse_locations l
      where l.tenant_id = ? and l.organization_id = ? and l.deleted_at is null and l.code = any(?::text[])
      order by l.created_at asc`,
    [scope.tenantId, scope.organizationId, `{${Object.values(LOCATION_CODES).join(',')}}`],
  )
  if (!rows.length) return null
  const warehouseId = rows[0].warehouse_id
  const locations = new Map<string, string>()
  for (const row of rows) if (row.warehouse_id === warehouseId && !locations.has(row.code)) locations.set(row.code, row.id)
  return { warehouseId, locations }
}

export async function variantsForProducts(scope: StockScope, productIds: string[]): Promise<Map<string, string>> {
  const ids = uuids(productIds)
  const result = new Map<string, string>()
  if (!ids.length) return result
  const rows = await run<Array<{ product_id: string; id: string }>>(
    scope,
    `select distinct on (product_id) product_id, id from catalog_product_variants
      where product_id = any(?::uuid[]) and tenant_id = ? and organization_id = ? and deleted_at is null
      order by product_id, created_at asc`,
    [`{${ids.join(',')}}`, scope.tenantId, scope.organizationId],
  )
  for (const row of rows) result.set(row.product_id, row.id)
  return result
}

export type LotStock = { variantId: string; lotId: string | null; lotNumber: string | null; onHand: number; free: number; expiresAt: string | null; status: string }

export function isUsable(lot: LotStock): boolean {
  return lot.status === 'available'
}

export async function lotsAtLocation(scope: StockScope, variantIds: string[], locationId: string): Promise<LotStock[]> {
  const ids = uuids(variantIds)
  if (!ids.length) return []
  const rows = await run<Array<{ catalog_variant_id: string; lot_id: string | null; lot_number: string | null; on_hand: string; free: string; expires_at: Date | null; status: string | null }>>(
    scope,
    `select b.catalog_variant_id, b.lot_id, lot.lot_number, coalesce(lot.status, 'available') as status, b.quantity_on_hand as on_hand,
            (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free, lot.expires_at
       from wms_inventory_balances b
       left join wms_inventory_lots lot on lot.id = b.lot_id
      where b.catalog_variant_id = any(?::uuid[]) and b.location_id = ? and b.tenant_id = ? and b.organization_id = ?
        and b.deleted_at is null and b.quantity_on_hand > 0
      order by b.created_at asc`,
    [`{${ids.join(',')}}`, locationId, scope.tenantId, scope.organizationId],
  )
  return rows.map((row) => ({
    variantId: row.catalog_variant_id,
    lotId: row.lot_id,
    lotNumber: row.lot_number,
    onHand: Number(row.on_hand),
    free: Number(row.free),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    status: row.status ?? 'available',
  }))
}
