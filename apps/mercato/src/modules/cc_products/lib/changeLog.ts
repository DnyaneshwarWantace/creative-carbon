import type { EntityManager } from '@mikro-orm/postgresql'
import { diffSnapshot, recordActivity } from '../../cc_audit/lib/activity'
import type { ActivityChange } from '../../cc_audit/data/entities'
import { PRODUCT_ENTITY_ID } from './fieldDefs'

export const REASON_HEADER = 'x-cc-reason'

type Scope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

export type ProductSnapshot = Record<string, unknown>

const COLUMN_LABELS: Record<string, string> = {
  title: 'Name',
  description: 'Description',
  defaultUnit: 'Unit',
  isActive: 'Active',
  sku: 'Stock code',
  kind: 'Item type',
  taxRate: 'GST %',
  hsCode: 'HS code',
  reorderPoint: 'Reorder level',
  safetyStock: 'Safety stock',
}

export async function productSnapshot(scope: Scope, productId: string): Promise<{ snapshot: ProductSnapshot; labels: Record<string, string> } | null> {
  const connection = scope.em.getConnection()
  const [row] = await connection.execute<Array<{ title: string; description: string | null; default_unit: string | null; is_active: boolean; sku: string | null; kind: string | null; tax_rate: string | null; hs_code: string | null }>>(
    'select title, description, default_unit, is_active, sku, custom_fieldset_code as kind, tax_rate, hs_code from catalog_products where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null',
    [productId, scope.tenantId, scope.organizationId],
  )
  if (!row) return null
  const values = await connection.execute<Array<{ field_key: string; value_text: string | null; value_multiline: string | null; value_int: number | null; value_float: number | null; value_bool: boolean | null }>>(
    'select field_key, value_text, value_multiline, value_int, value_float, value_bool from custom_field_values where entity_id = ? and record_id = ? and tenant_id = ? and deleted_at is null',
    [PRODUCT_ENTITY_ID, productId, scope.tenantId],
  )
  const defs = await connection.execute<Array<{ key: string; label: string | null }>>(
    `select key, config_json->>'label' as label from custom_field_defs where entity_id = ? and deleted_at is null and (tenant_id = ? or tenant_id is null)`,
    [PRODUCT_ENTITY_ID, scope.tenantId],
  )
  const [profile] = await connection.execute<Array<{ reorder_point: string | null; safety_stock: string | null }>>(
    'select reorder_point, safety_stock from wms_product_inventory_profiles where catalog_product_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null limit 1',
    [productId, scope.tenantId, scope.organizationId],
  )
  const custom: Record<string, unknown> = {}
  for (const value of values) {
    const raw = value.value_text ?? value.value_multiline ?? value.value_int ?? value.value_float ?? value.value_bool
    custom[`cf_${value.field_key}`] = Array.isArray(custom[`cf_${value.field_key}`]) ? [...(custom[`cf_${value.field_key}`] as unknown[]), raw] : custom[`cf_${value.field_key}`] !== undefined ? [custom[`cf_${value.field_key}`], raw] : raw
  }
  const labels: Record<string, string> = { ...COLUMN_LABELS }
  for (const def of defs) labels[`cf_${def.key}`] = def.label ?? def.key
  return {
    snapshot: {
      title: row.title,
      description: row.description,
      defaultUnit: row.default_unit,
      isActive: row.is_active,
      sku: row.sku,
      kind: row.kind,
      taxRate: row.tax_rate,
      hsCode: row.hs_code,
      reorderPoint: profile?.reorder_point ?? null,
      safetyStock: profile?.safety_stock ?? null,
      ...custom,
    },
    labels,
  }
}

export async function stockOnHand(scope: Scope, productId: string): Promise<number> {
  const [row] = await scope.em.getConnection().execute<Array<{ qty: string | null }>>(
    `select sum(b.quantity_on_hand) as qty from wms_inventory_balances b
       join catalog_product_variants v on v.id = b.catalog_variant_id
      where v.product_id = ? and b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null`,
    [productId, scope.tenantId, scope.organizationId],
  )
  return Number(row?.qty ?? 0)
}

export function changeRuleError(before: ProductSnapshot, requested: { defaultUnit?: unknown; isActive?: unknown }, onHand: number, reason: string | null): { status: number; message: string } | null {
  const unitChanges = requested.defaultUnit !== undefined && requested.defaultUnit !== null && String(requested.defaultUnit) !== String(before.defaultUnit ?? '')
  const deactivates = requested.isActive === false && before.isActive !== false
  if (unitChanges && onHand > 0.0005) return { status: 409, message: `The unit cannot change while ${onHand} ${String(before.defaultUnit ?? '')} is in stock. Use up or move out the stock first.` }
  if (deactivates && onHand > 0.0005) return { status: 409, message: `This item still has ${onHand} ${String(before.defaultUnit ?? '')} in stock. It can be set inactive once the stock is used up.` }
  if ((unitChanges || deactivates) && (!reason || reason.trim().length < 3)) return { status: 400, message: 'Write why (kept in the history)' }
  return null
}

export function logProductChange(scope: Scope, input: { productId: string; before: ProductSnapshot; after: ProductSnapshot; labels: Record<string, string>; reason: string | null; byName: string | null }): ActivityChange[] {
  const changes = diffSnapshot(input.before, input.after, input.labels)
  if (!changes.length) return changes
  const active = changes.find((change) => change.field === 'isActive')
  const action = active ? (active.to === false ? 'set_inactive' : 'set_active') : 'changed'
  recordActivity(scope.em, scope, {
    recordType: 'product',
    recordId: input.productId,
    action,
    kind: active || input.reason ? 'correction' : 'change',
    summary: `${changes.length} field${changes.length === 1 ? '' : 's'} changed`,
    reason: input.reason,
    changes,
    actorUserId: scope.userId ?? null,
    actorName: input.byName,
  })
  return changes
}
