import { randomUUID } from 'node:crypto'
import { PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { DEFAULT_MAX_USE, DEFAULT_SHELF_LIFE } from './coating'
import { PlantError } from './server'
import { kg3, plantStock } from './plantStock'

export type BstageAge = 'fresh' | 'soon' | 'expired' | 'blocked'

const BOARD_PLACES: StockPlace[] = ['floor', 'fg']

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export function ageBand(ageDays: number, shelfLife: number, maxUse: number): BstageAge {
  if (ageDays > maxUse) return 'blocked'
  if (ageDays > shelfLife) return 'expired'
  if (ageDays >= 5) return 'soon'
  return 'fresh'
}

type LotRow = {
  lot_id: string
  lot_number: string
  product_id: string
  title: string
  location_id: string
  on_hand: string
  free: string
  manufactured_at: Date | null
  expires_at: Date | null
  created_at: Date
  metadata: Record<string, unknown> | null
}

function numberFrom(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

async function lotRows(ctx: StoreContext, lotId?: string): Promise<{ rows: LotRow[]; placeOf: (id: string) => StockPlace | null }> {
  const stock = await plantStock(ctx, [])
  const rows = await ctx.em.getConnection().execute<LotRow[]>(
    `select lot.id as lot_id, lot.lot_number, p.id as product_id, p.title, b.location_id, b.quantity_on_hand as on_hand,
            (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free, lot.manufactured_at, lot.expires_at, lot.created_at, lot.metadata
       from wms_inventory_lots lot
       join catalog_product_variants v on v.id = lot.catalog_variant_id
       join catalog_products p on p.id = v.product_id
       join wms_inventory_balances b on b.lot_id = lot.id and b.deleted_at is null
      where lot.tenant_id = ? and lot.organization_id = ? and lot.deleted_at is null and p.custom_fieldset_code = 'bstage'
        and b.location_id = any(?::uuid[]) ${lotId ? 'and lot.id = ?' : 'and b.quantity_on_hand > 0'}
      order by lot.manufactured_at asc nulls last, lot.lot_number asc`,
    [ctx.tenantId, ctx.organizationId, `{${BOARD_PLACES.map((place) => stock.locationOf(place)).join(',')}}`, ...(lotId ? [lotId] : [])],
  )
  return { rows, placeOf: stock.placeOf }
}

function card(row: LotRow, place: StockPlace | null, today: string) {
  const meta = row.metadata ?? {}
  const madeOn = row.manufactured_at ? new Date(row.manufactured_at).toISOString().slice(0, 10) : new Date(row.created_at).toISOString().slice(0, 10)
  const shelfLife = numberFrom(meta.shelfLifeDays, DEFAULT_SHELF_LIFE) ?? DEFAULT_SHELF_LIFE
  const maxUse = numberFrom(meta.maxUseDays, DEFAULT_MAX_USE) ?? DEFAULT_MAX_USE
  const ageDays = daysBetween(madeOn, today)
  const onHand = kg3(Number(row.on_hand))
  const madeKg = numberFrom(meta.madeKg)
  const nos = numberFrom(meta.nos)
  return {
    lotId: row.lot_id,
    lotNumber: row.lot_number,
    productId: row.product_id,
    title: row.title,
    clothTitle: typeof meta.clothTitle === 'string' ? meta.clothTitle : null,
    gsm: numberFrom(meta.gsm),
    dryerCode: typeof meta.dryerCode === 'string' ? meta.dryerCode : null,
    resinBatchNo: typeof meta.resinBatchNo === 'string' ? meta.resinBatchNo : null,
    sheetId: typeof meta.sheetId === 'string' ? meta.sheetId : null,
    place,
    placeLabel: place ? PLACE_LABEL[place] : null,
    madeOn,
    expiresOn: row.expires_at ? new Date(row.expires_at).toISOString().slice(0, 10) : null,
    ageDays,
    shelfLife,
    maxUse,
    band: ageBand(ageDays, shelfLife, maxUse),
    onHandKg: onHand,
    freeKg: kg3(Number(row.free)),
    madeKg,
    nosMade: nos,
    nosLeft: nos !== null && madeKg ? Math.round((nos * onHand) / madeKg) : nos,
  }
}

export async function bstageBoard(ctx: StoreContext, filter: { q?: string }) {
  const today = todayIst()
  const { rows, placeOf } = await lotRows(ctx)
  let cards = rows.map((row) => card(row, placeOf(row.location_id), today))
  const term = filter.q?.trim().toLowerCase()
  if (term) cards = cards.filter((entry) => [entry.lotNumber, entry.title, entry.clothTitle ?? '', entry.dryerCode ?? '', entry.resinBatchNo ?? ''].some((value) => value.toLowerCase().includes(term)))
  const columns = (['fresh', 'soon', 'expired', 'blocked'] as BstageAge[]).map((band) => {
    const list = cards.filter((entry) => entry.band === band)
    return { band, lots: list, kg: kg3(list.reduce((sum, entry) => sum + entry.onHandKg, 0)), nos: list.reduce((sum, entry) => sum + (entry.nosLeft ?? 0), 0) }
  })
  return { today, columns, totalKg: kg3(cards.reduce((sum, entry) => sum + entry.onHandKg, 0)), lots: cards.length }
}

export async function bstageLot(ctx: StoreContext, lotId: string) {
  const today = todayIst()
  const { rows, placeOf } = await lotRows(ctx, lotId)
  if (!rows.length) throw new PlantError('B-stage lot not found', 404)
  const main = rows.find((row) => Number(row.on_hand) > 0) ?? rows[0]
  const summary = card({ ...main, on_hand: String(rows.reduce((sum, row) => sum + Number(row.on_hand), 0)), free: String(rows.reduce((sum, row) => sum + Number(row.free), 0)) }, placeOf(main.location_id), today)
  const movements = await ctx.em.getConnection().execute<Array<{ id: string; type: string; quantity: string; reason: string | null; reason_code: string | null; performed_at: Date; metadata: Record<string, unknown> | null }>>(
    `select id, type, quantity, reason, reason_code, performed_at, metadata from wms_inventory_movements
      where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by performed_at asc, created_at asc`,
    [lotId, ctx.tenantId, ctx.organizationId],
  )
  return {
    ...summary,
    movements: movements.map((row) => ({
      id: row.id,
      at: new Date(row.performed_at).toISOString(),
      kg: kg3(row.type === 'adjust' ? Number(row.quantity) : row.type === 'receipt' ? Math.abs(Number(row.quantity)) : -Math.abs(Number(row.quantity))),
      reason: row.reason,
      reasonCode: row.reason_code,
      source: typeof row.metadata?.source === 'string' ? row.metadata.source : null,
    })),
  }
}

export async function scrapBstage(ctx: StoreContext, input: { lotId: string; kg?: number; reason: string }, byName: string | null) {
  const { rows } = await lotRows(ctx, input.lotId)
  const row = rows.find((candidate) => Number(candidate.free) > 0)
  if (!row) throw new PlantError('Nothing left in this lot to scrap', 409)
  const free = kg3(Number(row.free))
  const kg = kg3(input.kg ?? free)
  if (kg > free + 0.0005) throw new PlantError(`Only ${free} kg is free in this lot`, 409)
  const stock = await plantStock(ctx, [row.product_id])
  const variantId = stock.variants.get(row.product_id)
  if (!variantId) throw new PlantError('That item has no stock record', 404)
  await runCommand(ctx, 'wms.inventory.adjust', {
    warehouseId: stock.warehouseId,
    locationId: row.location_id,
    catalogVariantId: variantId,
    lotId: row.lot_id,
    delta: -kg,
    reason: `Scrap B-stage · ${input.reason}`,
    reasonCode: 'bstage_scrap',
    referenceType: 'manual',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    metadata: { source: 'cc_production.bstage_scrap', reason: input.reason, byName },
  })
  return bstageLot(ctx, input.lotId)
}
