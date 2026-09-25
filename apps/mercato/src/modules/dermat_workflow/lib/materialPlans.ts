import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  MaterialPlan,
  MaterialPlanItem,
  MaterialRequest,
  MaterialRequestLine,
  StockReservation,
} from '../data/entities'
import type { ReservationMaterialKind } from '../data/entities'
import type { WorkflowScope } from './engine'
import {
  activeReservations,
  loadBoms,
  loadMaterials,
  loadOrders,
  packSizeGrams,
  pendingFromVendor,
  placeholders,
  qtyInMlByProduct,
  round,
} from './planning'

/**
 * Production planning (client transcripts, Dermat India 3 & 4): the planner
 * picks several BOMs at once with how much of each is to be made. Every BOM is
 * written for a 100 kg batch, so the requirement is qty-per-kg × bulk kg. The
 * RM / PM need of all BOMs is added together and compared with store stock and
 * with stock already reserved elsewhere. The planner then sends one request per
 * store ("we need this, you have this") and the store issues against it.
 */

export type PlanItemInput = {
  bomId: string
  quantityPcs: number
  packSizeGrams?: number | null
  bulkKg?: number | null
  orderId?: string | null
  orderNumber?: string | null
}

export type ResolvedPlanItem = {
  bomId: string
  bomName: string
  productId: string | null
  productName: string | null
  quantityPcs: number
  packSizeGrams: number | null
  bulkKg: number
  orderId: string | null
  orderNumber: string | null
  warning: string | null
}

export type PlanMaterial = {
  key: string
  materialKind: ReservationMaterialKind
  materialId: string
  code: string | null
  name: string
  unit: string | null
  required: number
  stock: number
  reservedForPlan: number
  reservedElsewhere: number
  reservedElsewhereRefs: Array<{ ref: string; quantity: number }>
  available: number
  pendingFromVendor: number
  shortfall: number
  usedBy: Array<{ bomName: string; quantity: number }>
}

export type PlanCalculation = {
  items: ResolvedPlanItem[]
  materials: PlanMaterial[]
  warnings: string[]
}

export type BomOption = {
  bomId: string
  bomName: string
  productId: string | null
  productName: string | null
  packSizeGrams: number | null
  lineCount: number
}

type BomMeta = { id: string; bom_name: string; catalog_product_id: string | null; product_name: string | null }
type BomLine = {
  bom_id: string
  raw_material_id: string | null
  packaging_material_id: string | null
  component_code: string | null
  qty_per_unit: string
  wastage_percent: string
  unit: string | null
}

const STORE_LABEL: Record<ReservationMaterialKind, string> = { raw_material: 'RM', packaging_material: 'PM' }

export async function listBomOptions(em: EntityManager, scope: WorkflowScope): Promise<BomOption[]> {
  const rows = await em.getConnection().execute<Array<BomMeta & { line_count: string }>>(
    `select b.id, b.bom_name, b.catalog_product_id, p.title as product_name,
            (select count(*) from dermat_bom_lines l where l.bom_id = b.id and l.deleted_at is null) as line_count
       from dermat_boms b
       left join catalog_products p on p.id = b.catalog_product_id
      where b.organization_id = ? and b.tenant_id = ? and b.deleted_at is null and b.is_active = true
      order by b.bom_name`,
    [scope.organizationId, scope.tenantId],
  )
  const productIds = rows.map((row) => row.catalog_product_id).filter((id): id is string => Boolean(id))
  const qtyInMl = await qtyInMlByProduct(em, productIds)
  return rows.map((row) => {
    const fromProduct = row.catalog_product_id ? qtyInMl.get(row.catalog_product_id) ?? null : null
    const pack = packSizeGrams(row.bom_name, fromProduct) ?? packSizeGrams(row.product_name, null)
    return {
      bomId: row.id,
      bomName: row.bom_name,
      productId: row.catalog_product_id,
      productName: row.product_name,
      packSizeGrams: pack?.grams ?? null,
      lineCount: Number(row.line_count) || 0,
    }
  })
}

/** Pieces-per-kg from the BOM's packing lines, used when no pack size is known. */
function piecesPerKg(lines: BomLine[]): number {
  return Math.max(0, ...lines.filter((line) => line.packaging_material_id).map((line) => Number(line.qty_per_unit) || 0))
}

function bulkKgFor(quantityPcs: number, packGrams: number | null, lines: BomLine[]): number | null {
  if (packGrams && packGrams > 0) return (quantityPcs * packGrams) / 1000
  const perKg = piecesPerKg(lines)
  return perKg > 0 ? quantityPcs / perKg : null
}

async function loadBomData(em: EntityManager, scope: WorkflowScope, bomIds: string[]) {
  if (!bomIds.length) return { metas: new Map<string, BomMeta>(), lines: [] as BomLine[] }
  const metaRows = await em.getConnection().execute<BomMeta[]>(
    `select b.id, b.bom_name, b.catalog_product_id, p.title as product_name
       from dermat_boms b left join catalog_products p on p.id = b.catalog_product_id
      where b.organization_id = ? and b.tenant_id = ? and b.deleted_at is null and b.id in (${placeholders(bomIds)})`,
    [scope.organizationId, scope.tenantId, ...bomIds],
  )
  const lines = await em.getConnection().execute<BomLine[]>(
    `select bom_id, raw_material_id, packaging_material_id, component_code, qty_per_unit, wastage_percent, unit
       from dermat_bom_lines where deleted_at is null and bom_id in (${placeholders(bomIds)})`,
    bomIds,
  )
  return { metas: new Map(metaRows.map((row) => [row.id, row])), lines }
}

export async function calculatePlan(
  em: EntityManager,
  scope: WorkflowScope,
  inputs: PlanItemInput[],
  planId: string | null,
): Promise<PlanCalculation> {
  const warnings: string[] = []
  const bomIds = Array.from(new Set(inputs.map((item) => item.bomId)))
  const { metas, lines } = await loadBomData(em, scope, bomIds)
  const items: ResolvedPlanItem[] = []
  const needs = new Map<string, { kind: ReservationMaterialKind; materialId: string; code: string | null; unit: string | null; quantity: number; usedBy: Map<string, number> }>()

  for (const input of inputs) {
    const meta = metas.get(input.bomId)
    const bomLines = lines.filter((line) => line.bom_id === input.bomId)
    const quantityPcs = Number(input.quantityPcs) || 0
    const packGrams = input.packSizeGrams && input.packSizeGrams > 0 ? Number(input.packSizeGrams) : null
    const bulk = input.bulkKg && input.bulkKg > 0 ? Number(input.bulkKg) : bulkKgFor(quantityPcs, packGrams, bomLines)
    const item: ResolvedPlanItem = {
      bomId: input.bomId,
      bomName: meta?.bom_name ?? 'Unknown BOM',
      productId: meta?.catalog_product_id ?? null,
      productName: meta?.product_name ?? null,
      quantityPcs,
      packSizeGrams: packGrams,
      bulkKg: round(bulk ?? 0),
      orderId: input.orderId ?? null,
      orderNumber: input.orderNumber ?? null,
      warning: null,
    }
    items.push(item)
    if (!meta) {
      item.warning = 'BOM not found'
      continue
    }
    if (!bomLines.length) {
      item.warning = 'This BOM has no materials'
      continue
    }
    if (bulk === null) {
      item.warning = 'Enter the pack size (g / ml) to calculate bulk kg'
      continue
    }
    const unlinked = bomLines.filter((line) => !line.raw_material_id && !line.packaging_material_id).length
    if (unlinked) item.warning = `${unlinked} sub-BOM / formulation row(s) are not linked and were not counted`
    for (const line of bomLines) {
      const kind: ReservationMaterialKind | null = line.raw_material_id ? 'raw_material' : line.packaging_material_id ? 'packaging_material' : null
      const materialId = line.raw_material_id ?? line.packaging_material_id
      if (!kind || !materialId) continue
      const quantity = (Number(line.qty_per_unit) || 0) * bulk * (1 + (Number(line.wastage_percent) || 0) / 100)
      if (quantity <= 0) continue
      const key = `${kind}:${materialId}`
      const entry = needs.get(key) ?? { kind, materialId, code: line.component_code, unit: line.unit, quantity: 0, usedBy: new Map<string, number>() }
      entry.quantity += quantity
      entry.usedBy.set(item.bomName, (entry.usedBy.get(item.bomName) ?? 0) + quantity)
      needs.set(key, entry)
    }
  }
  if (items.some((item) => item.warning)) warnings.push('Some BOMs could not be fully calculated — see the warning on each row.')

  const all = Array.from(needs.values())
  const rmIds = all.filter((entry) => entry.kind === 'raw_material').map((entry) => entry.materialId)
  const pmIds = all.filter((entry) => entry.kind === 'packaging_material').map((entry) => entry.materialId)
  const [rmRows, pmRows, pending, reservations] = await Promise.all([
    loadMaterials(em, scope, 'raw_material', rmIds),
    loadMaterials(em, scope, 'packaging_material', pmIds),
    pendingFromVendor(em, scope),
    activeReservations(em, scope, [...rmIds, ...pmIds]),
  ])

  const materials: PlanMaterial[] = Array.from(needs.entries()).map(([key, entry]) => {
    const source = entry.kind === 'raw_material' ? rmRows.get(entry.materialId) : pmRows.get(entry.materialId)
    const forMaterial = reservations.filter((r) => r.materialKind === entry.kind && r.materialId === entry.materialId)
    const mine = forMaterial.filter((r) => planId && r.planId === planId)
    const others = forMaterial.filter((r) => !(planId && r.planId === planId))
    const reservedForPlan = mine.reduce((sum, r) => sum + Number(r.quantity), 0)
    const reservedElsewhere = others.reduce((sum, r) => sum + Number(r.quantity), 0)
    const refs = new Map<string, number>()
    for (const reservation of others) {
      const ref = reservation.orderNumber ?? reservation.planNumber ?? '—'
      refs.set(ref, (refs.get(ref) ?? 0) + Number(reservation.quantity))
    }
    const stock = Number(source?.stock ?? 0)
    const available = stock - reservedForPlan - reservedElsewhere
    const pendingQty = pending.get(entry.materialId) ?? 0
    const stillNeeded = Math.max(0, entry.quantity - reservedForPlan)
    return {
      key,
      materialKind: entry.kind,
      materialId: entry.materialId,
      code: source?.code ?? entry.code,
      name: source?.name ?? entry.code ?? 'Unknown material',
      unit: source?.unit ?? entry.unit,
      required: round(entry.quantity),
      stock: round(stock),
      reservedForPlan: round(reservedForPlan),
      reservedElsewhere: round(reservedElsewhere),
      reservedElsewhereRefs: Array.from(refs.entries()).map(([ref, quantity]) => ({ ref, quantity: round(quantity) })),
      available: round(available),
      pendingFromVendor: round(pendingQty),
      shortfall: round(Math.max(0, stillNeeded - Math.max(0, available))),
      usedBy: Array.from(entry.usedBy.entries()).map(([bomName, quantity]) => ({ bomName, quantity: round(quantity) })),
    }
  })
  materials.sort((a, b) => (a.materialKind === b.materialKind ? a.name.localeCompare(b.name) : a.materialKind === 'raw_material' ? -1 : 1))
  return { items, materials, warnings }
}

/** Plan rows for the selected orders: one row per product line and BOM, pieces and pack size prefilled. */
export async function planItemsFromOrders(em: EntityManager, scope: WorkflowScope, orderIds: string[]): Promise<PlanItemInput[]> {
  const { orders, lines } = await loadOrders(em, scope, orderIds)
  const orderNumbers = new Map(orders.map((order) => [order.id, order.orderNumber ?? null]))
  const productIds = Array.from(new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id))))
  const [qtyInMl, { boms }] = await Promise.all([qtyInMlByProduct(em, productIds), loadBoms(em, scope, productIds)])
  const items: PlanItemInput[] = []
  for (const line of lines) {
    const orderId = typeof line.order === 'string' ? line.order : (line.order as unknown as { id: string }).id
    const pack = packSizeGrams(line.name ?? null, line.productId ? qtyInMl.get(line.productId) ?? null : null)
    for (const bom of boms.filter((entry) => entry.catalog_product_id === line.productId)) {
      items.push({
        bomId: bom.id,
        quantityPcs: Number(line.quantity) || 0,
        packSizeGrams: pack?.grams ?? packSizeGrams(bom.bom_name, null)?.grams ?? null,
        orderId,
        orderNumber: orderNumbers.get(orderId) ?? null,
      })
    }
  }
  return items
}

async function nextNumber(em: EntityManager, scope: WorkflowScope, table: string, column: string, prefix: string): Promise<string> {
  const rows = await em.getConnection().execute<Array<{ last: string | null }>>(
    `select max(${column}) as last from ${table} where organization_id = ? and tenant_id = ? and ${column} like ?`,
    [scope.organizationId, scope.tenantId, `${prefix}%`],
  )
  const last = rows[0]?.last ? Number(rows[0].last.slice(prefix.length)) || 0 : 0
  return `${prefix}${String(last + 1).padStart(4, '0')}`
}

export async function findPlan(em: EntityManager, scope: WorkflowScope, planId: string): Promise<MaterialPlan> {
  const plan = await em.findOne(MaterialPlan, { id: planId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null })
  if (!plan) throw new CrudHttpError(404, { error: 'Plan not found' })
  return plan
}

export async function planItems(em: EntityManager, scope: WorkflowScope, planId: string): Promise<MaterialPlanItem[]> {
  return em.find(
    MaterialPlanItem,
    { planId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null },
    { orderBy: { sequence: 'asc' } },
  )
}

export function toItemInput(item: MaterialPlanItem): PlanItemInput {
  return {
    bomId: item.bomId,
    quantityPcs: Number(item.quantityPcs),
    packSizeGrams: item.packSizeGrams != null ? Number(item.packSizeGrams) : null,
    bulkKg: Number(item.bulkKg),
    orderId: item.orderId ?? null,
    orderNumber: item.orderNumber ?? null,
  }
}

export async function planRequests(em: EntityManager, scope: WorkflowScope, planId: string): Promise<MaterialRequest[]> {
  return em.find(
    MaterialRequest,
    { planId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null },
    { orderBy: { createdAt: 'asc' } },
  )
}

export async function savePlan(
  em: EntityManager,
  scope: WorkflowScope,
  input: { planId?: string | null; name?: string | null; notes?: string | null; items: PlanItemInput[] },
  actor: string,
): Promise<MaterialPlan> {
  let plan: MaterialPlan
  if (input.planId) {
    plan = await findPlan(em, scope, input.planId)
    const openRequests = (await planRequests(em, scope, plan.id)).filter((request) => request.status !== 'cancelled')
    if (openRequests.length) {
      throw new CrudHttpError(409, { error: 'Requests were already sent to the store for this plan. Cancel them before changing the BOMs.' })
    }
  } else {
    const year = new Date().getFullYear()
    plan = em.create(MaterialPlan, {
      id: randomUUID(),
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      planNumber: await nextNumber(em, scope, 'dermat_material_plans', 'plan_number', `PLN-${year}-`),
      status: 'draft',
      createdBy: actor,
    })
    em.persist(plan)
  }
  plan.name = input.name?.trim() || null
  plan.notes = input.notes?.trim() || null
  const calculation = await calculatePlan(em, scope, input.items, plan.id)
  const existing = input.planId ? await planItems(em, scope, input.planId) : []
  for (const row of existing) em.remove(row)
  await em.flush()
  calculation.items.forEach((item, index) => {
    em.persist(
      em.create(MaterialPlanItem, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        planId: plan.id,
        bomId: item.bomId,
        bomName: item.bomName,
        productId: item.productId,
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        quantityPcs: String(item.quantityPcs),
        packSizeGrams: item.packSizeGrams != null ? String(item.packSizeGrams) : null,
        bulkKg: String(item.bulkKg),
        sequence: index,
      }),
    )
  })
  await em.flush()
  return plan
}

async function planCalculation(em: EntityManager, scope: WorkflowScope, plan: MaterialPlan): Promise<PlanCalculation> {
  const items = await planItems(em, scope, plan.id)
  if (!items.length) throw new CrudHttpError(400, { error: 'Add at least one BOM to the plan first' })
  return calculatePlan(em, scope, items.map(toItemInput), plan.id)
}

export async function sendStoreRequest(
  em: EntityManager,
  scope: WorkflowScope,
  planId: string,
  store: ReservationMaterialKind,
  actor: string,
  notes?: string | null,
): Promise<MaterialRequest> {
  const plan = await findPlan(em, scope, planId)
  const active = (await planRequests(em, scope, planId)).find((request) => request.store === store && request.status !== 'cancelled')
  if (active) {
    throw new CrudHttpError(409, { error: `Request ${active.requestNumber} was already sent to the ${STORE_LABEL[store]} store` })
  }
  const calculation = await planCalculation(em, scope, plan)
  const materials = calculation.materials.filter((material) => material.materialKind === store)
  if (!materials.length) throw new CrudHttpError(400, { error: `This plan needs no ${STORE_LABEL[store]} material` })
  const year = new Date().getFullYear()
  const request = em.create(MaterialRequest, {
    id: randomUUID(),
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    requestNumber: await nextNumber(em, scope, 'dermat_material_requests', 'request_number', `MR-${STORE_LABEL[store]}-${year}-`),
    planId: plan.id,
    planNumber: plan.planNumber,
    store,
    status: 'requested',
    requestedBy: actor,
    notes: notes?.trim() || null,
  })
  em.persist(request)
  for (const material of materials) {
    em.persist(
      em.create(MaterialRequestLine, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        requestId: request.id,
        materialId: material.materialId,
        materialCode: material.code,
        materialName: material.name,
        unit: material.unit,
        requiredQty: String(material.required),
        stockAtRequest: String(material.stock),
      }),
    )
  }
  plan.status = 'requested'
  await em.flush()
  return request
}

export async function cancelStoreRequest(em: EntityManager, scope: WorkflowScope, requestId: string): Promise<MaterialRequest> {
  const request = await em.findOne(MaterialRequest, { id: requestId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null })
  if (!request) throw new CrudHttpError(404, { error: 'Request not found' })
  if (request.status !== 'requested') throw new CrudHttpError(409, { error: 'Only a request that is not issued yet can be cancelled' })
  request.status = 'cancelled'
  const plan = await findPlan(em, scope, request.planId)
  const others = (await planRequests(em, scope, plan.id)).filter((entry) => entry.id !== request.id && entry.status !== 'cancelled')
  if (!others.length) plan.status = 'draft'
  else if (!others.some((entry) => entry.status === 'requested')) plan.status = 'completed'
  await em.flush()
  return request
}

/** Hold free stock for the plan without deducting it. */
export async function reserveForPlan(em: EntityManager, scope: WorkflowScope, planId: string, actor: string) {
  const plan = await findPlan(em, scope, planId)
  const calculation = await planCalculation(em, scope, plan)
  let reservedLines = 0
  let shortMaterials = 0
  for (const material of calculation.materials) {
    const need = material.required - material.reservedForPlan
    if (need <= 0) continue
    const quantity = Math.min(need, Math.max(0, material.available))
    if (quantity < need) shortMaterials += 1
    if (quantity <= 0) continue
    em.persist(
      em.create(StockReservation, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        planId: plan.id,
        planNumber: plan.planNumber,
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
    reservedLines += 1
  }
  await em.flush()
  return { reservedLines, shortMaterials }
}

export async function clearPlanReservations(em: EntityManager, scope: WorkflowScope, planId: string, actor: string, kind?: ReservationMaterialKind) {
  const where: Record<string, unknown> = { organizationId: scope.organizationId, tenantId: scope.tenantId, planId, status: 'active', deletedAt: null }
  if (kind) where.materialKind = kind
  const rows = await em.find(StockReservation, where)
  for (const row of rows) {
    row.status = 'released'
    row.closedAt = new Date()
    row.closedBy = actor
  }
  await em.flush()
  return rows.length
}

export async function loadRequestDetail(em: EntityManager, scope: WorkflowScope, requestId: string) {
  const request = await em.findOne(MaterialRequest, { id: requestId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null })
  if (!request) throw new CrudHttpError(404, { error: 'Request not found' })
  const lines = await em.find(
    MaterialRequestLine,
    { requestId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null },
    { orderBy: { materialName: 'asc' } },
  )
  const current = await loadMaterials(em, scope, request.store, lines.map((line) => line.materialId))
  return { request, lines, currentStock: new Map(Array.from(current.entries()).map(([id, row]) => [id, Number(row.stock) || 0])) }
}

/** The store hands the material over: debit store stock and use up the plan's reservation. */
export async function issueStoreRequest(
  em: EntityManager,
  scope: WorkflowScope,
  requestId: string,
  issued: Array<{ lineId: string; issuedQty: number }>,
  actor: string,
): Promise<MaterialRequest> {
  const { request, lines, currentStock } = await loadRequestDetail(em, scope, requestId)
  if (request.status !== 'requested') throw new CrudHttpError(409, { error: 'This request is already closed' })
  const table = request.store === 'raw_material' ? 'dermat_rm_master' : 'dermat_pm_master'
  const issuedById = new Map(issued.map((entry) => [entry.lineId, entry.issuedQty]))
  const tooMuch = lines.filter((line) => (issuedById.get(line.id) ?? 0) > (currentStock.get(line.materialId) ?? 0) + 1e-9)
  if (tooMuch.length) {
    throw new CrudHttpError(400, { error: `Not enough stock to issue: ${tooMuch.map((line) => line.materialName ?? line.materialCode).join(', ')}` })
  }
  const reservations = await em.find(StockReservation, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    planId: request.planId,
    materialKind: request.store,
    status: 'active',
    deletedAt: null,
  })
  for (const line of lines) {
    const quantity = round(Math.max(0, issuedById.get(line.id) ?? 0))
    line.issuedQty = String(quantity)
    if (quantity > 0 && line.materialCode) {
      await em.getConnection().execute(
        `update ${table} set stock = stock - ?, updated_at = now()
          where code = ? and organization_id = ? and tenant_id = ? and deleted_at is null`,
        [quantity, line.materialCode, scope.organizationId, scope.tenantId],
      )
    }
    for (const reservation of reservations.filter((entry) => entry.materialId === line.materialId)) {
      reservation.status = 'consumed'
      reservation.closedAt = new Date()
      reservation.closedBy = actor
    }
  }
  request.status = 'issued'
  request.issuedAt = new Date()
  request.issuedBy = actor
  await em.flush()
  const plan = await findPlan(em, scope, request.planId)
  const open = (await planRequests(em, scope, plan.id)).filter((entry) => entry.status === 'requested')
  if (!open.length) plan.status = 'completed'
  await em.flush()
  return request
}
