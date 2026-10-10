import type { StoreContext } from './server'

export const REVERSAL_CODE = /_(reopen|reverse|undo|cancel)$/

export function isReversal(reasonCode: string | null | undefined): boolean {
  return Boolean(reasonCode && REVERSAL_CODE.test(reasonCode))
}

type Row = { id: string; catalog_variant_id: string; lot_id: string | null; place: string | null; quantity: string; reason_code: string | null; metadata: Record<string, unknown> | null }

export async function linkReversals(ctx: StoreContext, metadata: Record<string, unknown>): Promise<number> {
  if (typeof metadata.source !== 'string') return 0
  const identity = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => (key === 'source' || /Id$/.test(key)) && typeof value === 'string'))
  if (Object.keys(identity).length < 2) return 0
  const connection = ctx.em.getConnection()
  const tx = ctx.em.getTransactionContext()
  const rows = await connection.execute<Row[]>(
    `select id, catalog_variant_id, lot_id, coalesce(location_to_id, location_from_id) as place, quantity, reason_code, metadata
       from wms_inventory_movements
      where tenant_id = ? and organization_id = ? and deleted_at is null and type in ('receipt', 'adjust') and metadata @> ?::jsonb
      order by performed_at asc, created_at asc`,
    [ctx.tenantId, ctx.organizationId, JSON.stringify(identity)],
    'all',
    tx,
  )
  const originals = rows.filter((row) => !isReversal(row.reason_code) && !row.metadata?.reversedBy)
  let linked = 0
  for (const reversal of rows.filter((row) => isReversal(row.reason_code) && !row.metadata?.reverses)) {
    const index = originals.findIndex(
      (row) => row.catalog_variant_id === reversal.catalog_variant_id && row.lot_id === reversal.lot_id && row.place === reversal.place && Math.abs(Number(row.quantity) + Number(reversal.quantity)) < 0.0005,
    )
    if (index < 0) continue
    const [original] = originals.splice(index, 1)
    await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reverses', ?::text) where id = ?`, [original.id, reversal.id], 'run', tx)
    await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reversedBy', ?::text) where id = ?`, [reversal.id, original.id], 'run', tx)
    linked += 1
  }
  return linked
}
