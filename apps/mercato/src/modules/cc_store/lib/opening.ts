import { randomUUID } from 'node:crypto'
import { PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { ensureStockRecords } from './stockSetup'
import { performerId, runCommand, type StoreContext } from './server'
import { placeLocations } from './stockBook'

export const OPENING_SOURCE = 'cc_store.opening'

const PLACE_BY_LABEL: Record<string, StockPlace> = {
  'warehouse a': 'wh_a',
  'wh-a': 'wh_a',
  'wh a': 'wh_a',
  'warehouse b': 'wh_b',
  'wh-b': 'wh_b',
  'wh b': 'wh_b',
  'resin tank': 'tank',
  tank: 'tank',
  'shop floor': 'floor',
  floor: 'floor',
  'fg store': 'fg',
  fg: 'fg',
  'finished goods': 'fg',
}

const STATUS_BY_LABEL: Record<string, 'available' | 'quarantine' | 'hold'> = {
  approved: 'available',
  ok: 'available',
  available: 'available',
  'under test': 'quarantine',
  'under qc test': 'quarantine',
  'waiting for check': 'quarantine',
  'on hold': 'hold',
  rejected: 'hold',
  hold: 'hold',
}

export type OpeningRow = {
  row: number
  store: string
  item: string
  lot: string
  quantity: string
  madeOn?: string
  expiry?: string
  status?: string
  thicknessMm?: string
  size?: string
  grade?: string
  pieces?: string
  gsm?: string
  note?: string
}

export type OpeningResult = { created: number; failed: number; errors: Array<{ row: number; error: string }>; plan: string[] }

type Product = { id: string; title: string; kind: string | null; unit: string | null; code: string | null; sku: string | null }

function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function number(value: string | undefined): number | null {
  if (!value || !value.trim()) return null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : NaN
}

async function productIndex(ctx: StoreContext): Promise<Map<string, Product[]>> {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; title: string; kind: string | null; unit: string | null; sku: string | null; code: string | null }>>(
    `select p.id, p.title, p.custom_fieldset_code as kind, p.default_unit as unit, p.sku,
            (select v.value_text from custom_field_values v where v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.field_key = 'item_code' and v.deleted_at is null limit 1) as code
       from catalog_products p where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null`,
    [ctx.tenantId, ctx.organizationId],
  )
  const index = new Map<string, Product[]>()
  for (const row of rows) {
    for (const name of [row.title, row.code, row.sku]) {
      if (!name) continue
      const list = index.get(key(name)) ?? []
      if (!list.some((entry) => entry.id === row.id)) list.push(row)
      index.set(key(name), list)
    }
  }
  return index
}

function placeAllowed(kind: string | null, place: StockPlace): string | null {
  if (kind === 'resin' && place !== 'tank' && place !== 'floor') return 'Resin goes in the Resin tank or on the Shop floor'
  if (kind !== 'resin' && place === 'tank') return 'Only resin goes in the Resin tank'
  return null
}

export async function loadOpeningStock(ctx: StoreContext, cutoverDate: string, rows: OpeningRow[], options: { dryRun: boolean; byName: string | null }): Promise<OpeningResult> {
  const errors: Array<{ row: number; error: string }> = []
  const products = await productIndex(ctx)
  type Ready = { row: OpeningRow; product: Product; place: StockPlace; qty: number; status: 'available' | 'quarantine' | 'hold'; metadata: Record<string, unknown>; lotNumber: string }
  const ready: Ready[] = []
  const seenLots = new Set<string>()
  for (const row of rows) {
    const fail = (error: string) => errors.push({ row: row.row, error })
    const place = PLACE_BY_LABEL[key(row.store)]
    if (!place) {
      fail(`Store "${row.store}" is not one of: Warehouse A, Warehouse B, Resin tank, Shop floor, FG store`)
      continue
    }
    const matches = products.get(key(row.item)) ?? []
    if (!matches.length) {
      fail(`Item "${row.item}" is not in the item master (use its name or item code)`)
      continue
    }
    if (matches.length > 1) {
      fail(`"${row.item}" matches ${matches.length} items; use the item code`)
      continue
    }
    const product = matches[0]
    const wrongPlace = placeAllowed(product.kind, place)
    if (wrongPlace) {
      fail(wrongPlace)
      continue
    }
    const qty = number(row.quantity)
    if (qty === null || Number.isNaN(qty) || qty <= 0) {
      fail('Quantity must be a number above 0')
      continue
    }
    const lotNumber = row.lot.trim()
    const lotKey = `${product.id}|${key(lotNumber)}`
    if (seenLots.has(lotKey)) {
      fail(`Lot ${lotNumber} of ${product.title} is twice in the file`)
      continue
    }
    seenLots.add(lotKey)
    const status = row.status?.trim() ? STATUS_BY_LABEL[key(row.status)] : 'available'
    if (!status) {
      fail('QC status must be Approved, Under test or On hold')
      continue
    }
    const thickness = number(row.thicknessMm)
    const pieces = number(row.pieces)
    const gsm = number(row.gsm)
    if ([thickness, pieces, gsm].some((value) => value !== null && Number.isNaN(value))) {
      fail('Thickness, pieces and GSM must be numbers')
      continue
    }
    if (row.madeOn && !/^\d{4}-\d{2}-\d{2}$/.test(row.madeOn)) {
      fail('Made / received on must be a date')
      continue
    }
    if (row.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiry)) {
      fail('Expiry must be a date')
      continue
    }
    const metadata: Record<string, unknown> = {
      source: OPENING_SOURCE,
      cutoverDate,
      byName: options.byName,
      ...(thickness !== null ? { thicknessMm: thickness } : {}),
      ...(row.size?.trim() ? { cutSize: row.size.trim(), sheetSize: row.size.trim() } : {}),
      ...(row.grade?.trim() ? { grade: row.grade.trim() } : {}),
      ...(pieces !== null ? { nos: pieces, madeKg: product.unit === 'nos' ? null : qty } : {}),
      ...(gsm !== null ? { gsm } : {}),
      ...(row.note?.trim() ? { note: row.note.trim() } : {}),
    }
    ready.push({ row, product, place, qty: Math.round(qty * 1000) / 1000, status, metadata, lotNumber })
  }

  if (ready.length) {
    const existing = await ctx.em.getConnection().execute<Array<{ lot_number: string; product_id: string }>>(
      `select lot.lot_number, v.product_id from wms_inventory_lots lot join catalog_product_variants v on v.id = lot.catalog_variant_id
        where lot.tenant_id = ? and lot.organization_id = ? and lot.deleted_at is null and v.product_id = any(?::uuid[])`,
      [ctx.tenantId, ctx.organizationId, `{${[...new Set(ready.map((entry) => entry.product.id))].join(',')}}`],
    )
    const taken = new Set(existing.map((row) => `${row.product_id}|${key(row.lot_number)}`))
    for (let index = ready.length - 1; index >= 0; index -= 1) {
      const entry = ready[index]
      if (taken.has(`${entry.product.id}|${key(entry.lotNumber)}`)) {
        errors.push({ row: entry.row.row, error: `Lot ${entry.lotNumber} of ${entry.product.title} is already in stock; opening stock is loaded once` })
        ready.splice(index, 1)
      }
    }
  }

  const byPlace = new Map<StockPlace, number>()
  for (const entry of ready) byPlace.set(entry.place, (byPlace.get(entry.place) ?? 0) + 1)
  const plan = [...byPlace.entries()].map(([place, count]) => `${count} lot${count === 1 ? '' : 's'} into the ${PLACE_LABEL[place]}`)
  if (options.dryRun || !ready.length) return { created: options.dryRun ? ready.length : 0, failed: errors.length, errors, plan }

  const { warehouseId, byPlace: locations } = await placeLocations(ctx)
  const variants = await ensureStockRecords(ctx, [...new Set(ready.map((entry) => entry.product.id))])
  const performedAt = new Date(`${cutoverDate}T09:00:00+05:30`)
  let created = 0
  for (const entry of ready) {
    try {
      const variantId = variants.get(entry.product.id)
      const locationId = locations.get(entry.place)
      if (!variantId || !locationId) throw new Error('This item has no stock record')
      const [variant] = await ctx.em.getConnection().execute<Array<{ sku: string | null }>>('select sku from catalog_product_variants where id = ?', [variantId])
      if (!variant?.sku) throw new Error('This item has no stock code (SKU) yet; open it and save it once')
      const lot = await runCommand<{ lotId: string }>(ctx, 'wms.lots.create', {
        catalogVariantId: variantId,
        sku: variant.sku,
        lotNumber: entry.lotNumber,
        batchNumber: entry.lotNumber,
        manufacturedAt: entry.row.madeOn || cutoverDate,
        ...(entry.row.expiry ? { expiresAt: entry.row.expiry } : {}),
        status: entry.status,
        metadata: entry.metadata,
      })
      await runCommand(ctx, 'wms.inventory.receive', {
        warehouseId,
        locationId,
        catalogVariantId: variantId,
        lotId: lot.lotId,
        quantity: entry.qty,
        referenceType: 'manual',
        referenceId: randomUUID(),
        performedBy: performerId(ctx),
        performedAt,
        reason: `Opening stock on ${cutoverDate}`,
        metadata: entry.metadata,
      })
      created += 1
    } catch (cause) {
      errors.push({ row: entry.row.row, error: cause instanceof Error ? cause.message : 'Could not load this row' })
    }
  }
  return { created, failed: errors.length, errors, plan }
}

export async function openingSummary(ctx: StoreContext) {
  const rows = await ctx.em.getConnection().execute<Array<{ location_code: string; lots: string; kg: string; cutover: string | null }>>(
    `select l.code as location_code, count(distinct m.lot_id) as lots, sum(abs(m.quantity)) as kg, max(m.metadata->>'cutoverDate') as cutover
       from wms_inventory_movements m join wms_warehouse_locations l on l.id = m.location_to_id
      where m.tenant_id = ? and m.organization_id = ? and m.deleted_at is null and m.metadata->>'source' = 'cc_store.opening'
      group by l.code`,
    [ctx.tenantId, ctx.organizationId],
  )
  return rows.map((row) => ({ code: row.location_code, lots: Number(row.lots), kg: Math.round(Number(row.kg) * 1000) / 1000, cutoverDate: row.cutover }))
}
