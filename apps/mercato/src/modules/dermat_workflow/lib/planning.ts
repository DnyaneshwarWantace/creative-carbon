import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { SalesOrder, SalesOrderLine } from '@open-mercato/core/modules/sales/data/entities'
import { StockReservation } from '../data/entities'
import type { ReservationMaterialKind } from '../data/entities'
import type { WorkflowScope } from './engine'

/**
 * Material planning (client transcripts, Dermat India 3 & 4): as soon as an
 * order has a BOM the material requirement is known; the planner selects one or
 * more orders, shared materials are added together, and the planner may reserve
 * stock for an order without debiting it. Other orders' reservations are always
 * visible so a new order is never planned against stock already promised.
 */

type BomRow = { id: string; bom_name: string; catalog_product_id: string; version: number }
type BomLineRow = {
  bom_id: string
  component_kind: string
  raw_material_id: string | null
  packaging_material_id: string | null
  component_code: string | null
  qty_per_unit: string
  wastage_percent: string
  unit: string | null
}
type MaterialRow = { id: string; name: string; code: string | null; unit: string | null; stock: string }

export type PlanningOrderLine = {
  lineId: string
  productId: string | null
  productName: string | null
  quantity: number
  bulkKg: number | null
  packSizeLabel: string | null
  boms: string[]
  warning: string | null
}

export type PlanningOrder = {
  orderId: string
  orderNumber: string | null
  customerName: string | null
  lines: PlanningOrderLine[]
}

export type PlanningMaterial = {
  key: string
  materialKind: ReservationMaterialKind
  materialId: string
  code: string | null
  name: string
  unit: string | null
  required: number
  stock: number
  reservedForSelected: number
  reservedByOthers: number
  reservedByOthersOrders: Array<{ orderId: string; orderNumber: string | null; quantity: number }>
  available: number
  pendingFromVendor: number
  toBeOrdered: number
  perOrder: Array<{ orderId: string; orderNumber: string | null; required: number; reserved: number }>
}

export type PlanningResult = {
  orders: PlanningOrder[]
  materials: PlanningMaterial[]
  warnings: string[]
}

export const round = (value: number) => Math.round(value * 1000) / 1000

export function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(', ')
}

function customerNameOf(order: SalesOrder): string | null {
  const snapshot = (order.customerSnapshot ?? {}) as Record<string, unknown>
  const customer = (snapshot.customer ?? {}) as Record<string, unknown>
  const name = customer.displayName ?? customer.name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/** Grams / ml per piece, from the product's "Qty in ML" field or the size in its name. */
export function packSizeGrams(productName: string | null, qtyInMl: number | null): { grams: number; label: string } | null {
  if (qtyInMl && qtyInMl > 0) return { grams: qtyInMl, label: `${qtyInMl} ml` }
  const match = (productName ?? '').match(/(\d+(?:\.\d+)?)\s*(kg|gms?|g|ml|l)\b/i)
  if (!match) return null
  const value = Number(match[1])
  const unit = match[2].toLowerCase()
  if (!Number.isFinite(value) || value <= 0) return null
  const grams = unit === 'kg' || unit === 'l' ? value * 1000 : value
  return { grams, label: `${match[1]} ${match[2]}` }
}

export async function loadOrders(em: EntityManager, scope: WorkflowScope, orderIds: string[]) {
  const where = { organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null }
  const orders = await findWithDecryption(em, SalesOrder, { id: { $in: orderIds }, ...where }, {}, scope)
  const lines = await findWithDecryption(
    em,
    SalesOrderLine,
    { order: { $in: orderIds }, ...where },
    { orderBy: { lineNumber: 'asc' } },
    scope,
  )
  return { orders, lines: lines.filter((line) => (line.kind ?? 'product') === 'product') }
}

export async function qtyInMlByProduct(em: EntityManager, productIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!productIds.length) return result
  const rows = await em.getConnection().execute<Array<{ record_id: string; value_float: number | null; value_text: string | null }>>(
    `select record_id, value_float, value_text from custom_field_values
      where entity_id = 'catalog:catalog_product' and field_key = 'qty_in_ml' and deleted_at is null
        and record_id in (${placeholders(productIds)})`,
    productIds,
  )
  for (const row of rows) {
    const value = Number(row.value_float ?? row.value_text)
    if (Number.isFinite(value) && value > 0) result.set(row.record_id, value)
  }
  return result
}

export async function loadBoms(em: EntityManager, scope: WorkflowScope, productIds: string[]) {
  if (!productIds.length) return { boms: [] as BomRow[], lines: [] as BomLineRow[] }
  const all = await em.getConnection().execute<BomRow[]>(
    `select id, bom_name, catalog_product_id, version from dermat_boms
      where organization_id = ? and tenant_id = ? and deleted_at is null and is_active = true
        and catalog_product_id in (${placeholders(productIds)})
      order by version desc`,
    [scope.organizationId, scope.tenantId, ...productIds],
  )
  const latest = new Map<string, BomRow>()
  for (const bom of all) {
    const key = `${bom.catalog_product_id}::${bom.bom_name}`
    if (!latest.has(key)) latest.set(key, bom)
  }
  const boms = Array.from(latest.values())
  if (!boms.length) return { boms, lines: [] as BomLineRow[] }
  const lines = await em.getConnection().execute<BomLineRow[]>(
    `select bom_id, component_kind, raw_material_id, packaging_material_id, component_code, qty_per_unit, wastage_percent, unit
       from dermat_bom_lines where deleted_at is null and bom_id in (${placeholders(boms.map((bom) => bom.id))})`,
    boms.map((bom) => bom.id),
  )
  return { boms, lines }
}

/**
 * BOM lines reference products in the product master (RM / PM categories);
 * on-hand stock is still kept in the RM / PM store tables, matched by code.
 */
export async function loadMaterials(em: EntityManager, scope: WorkflowScope, kind: ReservationMaterialKind, ids: string[]) {
  const map = new Map<string, MaterialRow>()
  if (!ids.length) return map
  const store = kind === 'raw_material' ? 'dermat_rm_master' : 'dermat_pm_master'
  const rows = await em.getConnection().execute<MaterialRow[]>(
    `select p.id, p.title as name, coalesce(p.sku, s.code) as code, s.unit, coalesce(s.stock, 0) as stock
       from catalog_products p
       left join ${store} s on s.code = p.sku and s.organization_id = p.organization_id
                           and s.tenant_id = p.tenant_id and s.deleted_at is null
      where p.organization_id = ? and p.tenant_id = ? and p.id in (${placeholders(ids)})`,
    [scope.organizationId, scope.tenantId, ...ids],
  )
  for (const row of rows) map.set(row.id, row)
  return map
}

export async function pendingFromVendor(em: EntityManager, scope: WorkflowScope): Promise<Map<string, number>> {
  const rows = await em.getConnection().execute<Array<{ material_id: string; pending: string }>>(
    `select coalesce(l.raw_material_id, l.packaging_material_id) as material_id,
            sum(greatest(l.quantity - coalesce(l.received_quantity, 0), 0)) as pending
       from dermat_purchase_order_lines l
       join dermat_purchase_orders p on p.id = l.purchase_order_id and p.deleted_at is null
      where l.deleted_at is null and p.organization_id = ? and p.tenant_id = ?
        and p.status in ('issued', 'partially_received')
      group by 1`,
    [scope.organizationId, scope.tenantId],
  )
  return new Map(rows.map((row) => [row.material_id, Number(row.pending) || 0]))
}

type LineRequirement = { orderId: string; kind: ReservationMaterialKind; materialId: string; code: string | null; unit: string | null; quantity: number }

/** Material needed for each order line (walks every active BOM of the product). */
async function lineRequirements(
  em: EntityManager,
  scope: WorkflowScope,
  orderIds: string[],
): Promise<{ orders: PlanningOrder[]; requirements: Array<LineRequirement & { lineId: string }>; warnings: string[] }> {
  const warnings: string[] = []
  const { orders, lines } = await loadOrders(em, scope, orderIds)
  const productIds = Array.from(new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id))))
  const [qtyInMl, { boms, lines: bomLines }] = await Promise.all([qtyInMlByProduct(em, productIds), loadBoms(em, scope, productIds)])
  const requirements: Array<LineRequirement & { lineId: string }> = []
  const planningOrders: PlanningOrder[] = orders.map((order) => ({
    orderId: order.id,
    orderNumber: order.orderNumber ?? null,
    customerName: customerNameOf(order),
    lines: [],
  }))
  const byOrder = new Map(planningOrders.map((order) => [order.orderId, order]))

  for (const line of lines) {
    const orderId = typeof line.order === 'string' ? line.order : (line.order as unknown as { id: string }).id
    const planningOrder = byOrder.get(orderId)
    if (!planningOrder) continue
    const quantity = Number(line.quantity) || 0
    const productBoms = boms.filter((bom) => bom.catalog_product_id === line.productId)
    const pack = packSizeGrams(line.name ?? null, line.productId ? qtyInMl.get(line.productId) ?? null : null)
    const entry: PlanningOrderLine = {
      lineId: line.id,
      productId: line.productId ?? null,
      productName: line.name ?? null,
      quantity,
      bulkKg: null,
      packSizeLabel: pack?.label ?? null,
      boms: productBoms.map((bom) => bom.bom_name),
      warning: null,
    }
    planningOrder.lines.push(entry)
    if (!productBoms.length) {
      entry.warning = 'No active BOM for this product'
      continue
    }
    const productLines = bomLines.filter((bomLine) => productBoms.some((bom) => bom.id === bomLine.bom_id))
    let bulkKg = pack ? (quantity * pack.grams) / 1000 : null
    if (bulkKg === null) {
      const piecesPerKg = Math.max(
        0,
        ...productLines
          .filter((bomLine) => bomLine.component_kind === 'packaging_material')
          .map((bomLine) => Number(bomLine.qty_per_unit) || 0),
      )
      bulkKg = piecesPerKg > 0 ? quantity / piecesPerKg : null
    }
    if (bulkKg === null) {
      entry.warning = 'Pack size unknown — add "Qty in ML" to the product'
      continue
    }
    entry.bulkKg = round(bulkKg)
    const unresolved = productLines.filter((bomLine) => !bomLine.raw_material_id && !bomLine.packaging_material_id)
    if (unresolved.length) {
      entry.warning = `${unresolved.length} sub-BOM / formulation row(s) are not linked to a BOM and were not expanded`
    }
    for (const bomLine of productLines) {
      const kind: ReservationMaterialKind | null = bomLine.raw_material_id
        ? 'raw_material'
        : bomLine.packaging_material_id
          ? 'packaging_material'
          : null
      const materialId = bomLine.raw_material_id ?? bomLine.packaging_material_id
      if (!kind || !materialId) continue
      const perKg = Number(bomLine.qty_per_unit) || 0
      const wastage = Number(bomLine.wastage_percent) || 0
      const needed = perKg * bulkKg * (1 + wastage / 100)
      if (needed <= 0) continue
      requirements.push({ orderId, lineId: line.id, kind, materialId, code: bomLine.component_code, unit: bomLine.unit, quantity: needed })
    }
  }
  if (planningOrders.some((order) => order.lines.some((line) => line.warning))) {
    warnings.push('Some products could not be fully calculated — see the warnings on each order line.')
  }
  return { orders: planningOrders, requirements, warnings }
}

export async function activeReservations(em: EntityManager, scope: WorkflowScope, materialIds?: string[]) {
  const where: Record<string, unknown> = {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    status: 'active',
    deletedAt: null,
  }
  if (materialIds) where.materialId = { $in: materialIds }
  return em.find(StockReservation, where)
}

export async function buildPlanning(em: EntityManager, scope: WorkflowScope, orderIds: string[]): Promise<PlanningResult> {
  const { orders, requirements, warnings } = await lineRequirements(em, scope, orderIds)
  const materialKeys = new Map<string, { kind: ReservationMaterialKind; materialId: string; code: string | null; unit: string | null }>()
  for (const requirement of requirements) {
    materialKeys.set(`${requirement.kind}:${requirement.materialId}`, requirement)
  }
  const rmIds = Array.from(materialKeys.values()).filter((m) => m.kind === 'raw_material').map((m) => m.materialId)
  const pmIds = Array.from(materialKeys.values()).filter((m) => m.kind === 'packaging_material').map((m) => m.materialId)
  const [rmRows, pmRows, pending, reservations] = await Promise.all([
    loadMaterials(em, scope, 'raw_material', rmIds),
    loadMaterials(em, scope, 'packaging_material', pmIds),
    pendingFromVendor(em, scope),
    activeReservations(em, scope, [...rmIds, ...pmIds]),
  ])
  const orderNumbers = new Map(orders.map((order) => [order.orderId, order.orderNumber]))
  const selected = new Set(orderIds)

  const materials: PlanningMaterial[] = Array.from(materialKeys.entries()).map(([key, meta]) => {
    const source = meta.kind === 'raw_material' ? rmRows.get(meta.materialId) : pmRows.get(meta.materialId)
    const forMaterial = requirements.filter((r) => r.kind === meta.kind && r.materialId === meta.materialId)
    const required = forMaterial.reduce((sum, r) => sum + r.quantity, 0)
    const materialReservations = reservations.filter((r) => r.materialKind === meta.kind && r.materialId === meta.materialId)
    const reservedForSelected = materialReservations.filter((r) => selected.has(r.orderId ?? '')).reduce((s, r) => s + Number(r.quantity), 0)
    const others = materialReservations.filter((r) => !selected.has(r.orderId ?? ''))
    const reservedByOthers = others.reduce((s, r) => s + Number(r.quantity), 0)
    const stock = Number(source?.stock ?? 0)
    const available = stock - reservedForSelected - reservedByOthers
    const pendingQty = pending.get(meta.materialId) ?? 0
    const stillNeeded = Math.max(0, required - reservedForSelected)
    const toBeOrdered = Math.max(0, stillNeeded - Math.max(0, available) - pendingQty)
    const perOrder = orderIds.map((orderId) => ({
      orderId,
      orderNumber: orderNumbers.get(orderId) ?? null,
      required: round(forMaterial.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.quantity, 0)),
      reserved: round(materialReservations.filter((r) => r.orderId === orderId).reduce((s, r) => s + Number(r.quantity), 0)),
    })).filter((entry) => entry.required > 0 || entry.reserved > 0)
    const byOtherOrder = new Map<string, { orderId: string; orderNumber: string | null; quantity: number }>()
    for (const reservation of others) {
      const refId = reservation.orderId ?? reservation.planId ?? ''
      const existing = byOtherOrder.get(refId)
      if (existing) existing.quantity += Number(reservation.quantity)
      else byOtherOrder.set(refId, { orderId: refId, orderNumber: reservation.orderNumber ?? reservation.planNumber ?? null, quantity: Number(reservation.quantity) })
    }
    return {
      key,
      materialKind: meta.kind,
      materialId: meta.materialId,
      code: source?.code ?? meta.code,
      name: source?.name ?? meta.code ?? 'Unknown material',
      unit: source?.unit ?? meta.unit,
      required: round(required),
      stock: round(stock),
      reservedForSelected: round(reservedForSelected),
      reservedByOthers: round(reservedByOthers),
      reservedByOthersOrders: Array.from(byOtherOrder.values()).map((entry) => ({ ...entry, quantity: round(entry.quantity) })),
      available: round(available),
      pendingFromVendor: round(pendingQty),
      toBeOrdered: round(toBeOrdered),
      perOrder,
    }
  })
  materials.sort((a, b) => (a.materialKind === b.materialKind ? a.name.localeCompare(b.name) : a.materialKind === 'raw_material' ? -1 : 1))
  return { orders, materials, warnings }
}

/**
 * Reserve stock for the selected orders, in the order given: each order gets up
 * to what its BOM still needs, limited to stock not already reserved by anyone.
 */
export async function reserveForOrders(
  em: EntityManager,
  scope: WorkflowScope,
  orderIds: string[],
  actor: string,
): Promise<{ reservedLines: number; shortMaterials: number }> {
  const planning = await buildPlanning(em, scope, orderIds)
  let reservedLines = 0
  let shortMaterials = 0
  for (const material of planning.materials) {
    let free = material.stock - material.reservedForSelected - material.reservedByOthers
    let short = false
    for (const entry of material.perOrder) {
      const need = entry.required - entry.reserved
      if (need <= 0) continue
      const quantity = Math.min(need, Math.max(0, free))
      if (quantity < need) short = true
      if (quantity <= 0) continue
      em.persist(
        em.create(StockReservation, {
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          orderId: entry.orderId,
          orderNumber: entry.orderNumber,
          materialKind: material.materialKind,
          materialId: material.materialId,
          materialCode: material.code,
          materialName: material.name,
          unit: material.unit,
          quantity: String(round(quantity)),
          status: 'active',
          reservedBy: actor,
        }),
      )
      free -= quantity
      reservedLines += 1
    }
    if (short) shortMaterials += 1
  }
  await em.flush()
  return { reservedLines, shortMaterials }
}

export async function clearReservations(
  em: EntityManager,
  scope: WorkflowScope,
  orderIds: string[],
  actor: string,
): Promise<number> {
  const rows = await em.find(StockReservation, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    orderId: { $in: orderIds },
    status: 'active',
    deletedAt: null,
  })
  for (const row of rows) {
    row.status = 'released'
    row.closedAt = new Date()
    row.closedBy = actor
  }
  await em.flush()
  return rows.length
}

/**
 * The store issued material for one order line (Requirement to Store /
 * Bottle Requirement): debit stock by what that line needs and use up the
 * order's reservation for it.
 */
export async function consumeForLine(
  em: EntityManager,
  scope: WorkflowScope,
  orderId: string,
  lineId: string,
  kind: ReservationMaterialKind,
  actor: string,
): Promise<void> {
  const { requirements } = await lineRequirements(em, scope, [orderId])
  const forLine = requirements.filter((r) => r.lineId === lineId && r.kind === kind)
  if (!forLine.length) return
  const table = kind === 'raw_material' ? 'dermat_rm_master' : 'dermat_pm_master'
  const reservations = await em.find(StockReservation, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    orderId,
    materialKind: kind,
    status: 'active',
    deletedAt: null,
  })
  for (const requirement of forLine) {
    const quantity = round(requirement.quantity)
    const codeRows = await em.getConnection().execute<Array<{ sku: string | null }>>(
      `select sku from catalog_products where id = ? and organization_id = ? and tenant_id = ?`,
      [requirement.materialId, scope.organizationId, scope.tenantId],
    )
    const code = codeRows[0]?.sku ?? requirement.code
    if (code) {
      await em.getConnection().execute(
        `update ${table} set stock = stock - ?, updated_at = now()
          where code = ? and organization_id = ? and tenant_id = ? and deleted_at is null`,
        [quantity, code, scope.organizationId, scope.tenantId],
      )
    }
    let remaining = quantity
    for (const reservation of reservations.filter((r) => r.materialId === requirement.materialId && r.status === 'active')) {
      if (remaining <= 0) break
      const held = Number(reservation.quantity)
      const used = Math.min(held, remaining)
      remaining -= used
      if (used >= held) {
        reservation.status = 'consumed'
        reservation.closedAt = new Date()
        reservation.closedBy = actor
      } else {
        reservation.quantity = String(round(held - used))
        em.persist(
          em.create(StockReservation, {
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            orderId,
            orderNumber: reservation.orderNumber ?? null,
            materialKind: kind,
            materialId: requirement.materialId,
            materialCode: reservation.materialCode ?? null,
            materialName: reservation.materialName ?? null,
            unit: reservation.unit ?? null,
            quantity: String(round(used)),
            status: 'consumed',
            reservedBy: reservation.reservedBy ?? null,
            closedAt: new Date(),
            closedBy: actor,
          }),
        )
      }
    }
  }
  await em.flush()
}

/** Orders a planner can pick: everything not yet dispatched, with their current stage. */
export async function planningCandidates(em: EntityManager, scope: WorkflowScope) {
  const rows = await em.getConnection().execute<Array<{ id: string; order_number: string; stage: string | null; reserved: string }>>(
    `select o.id, o.order_number, v.value_text as stage,
            coalesce((select sum(r.quantity) from dermat_stock_reservations r
                       where r.order_id = o.id and r.status = 'active' and r.deleted_at is null), 0) as reserved
       from sales_orders o
       left join lateral (
         select value_text from custom_field_values
          where entity_id = 'sales:sales_order' and field_key = 'order_stage' and deleted_at is null and record_id = o.id::text
          order by created_at desc limit 1
       ) v on true
      where o.organization_id = ? and o.tenant_id = ? and o.deleted_at is null
      order by o.created_at desc`,
    [scope.organizationId, scope.tenantId],
  )
  return rows
}
