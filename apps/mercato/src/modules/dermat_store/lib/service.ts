import { randomUUID } from 'node:crypto'
import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../../dermat_orders/data/entities'
import { approvedPackBoms, currentUserName, loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { financialYear, stageDef } from '../../dermat_orders/lib/stages'
import { BomHeader } from '../../dermat_boms/data/entities'
import { explodeBom } from '../../dermat_boms/lib/explode'
import { LOCATION_CODES, dermatWarehouse, isUsable, lotsAtLocation, variantsForProducts, type StockScope } from '../../dermat_products/lib/stock'
import { consumeReservation, freeFor, reservationsFor } from '../../dermat_planning/lib/service'
import { StoreRequest, StoreRequestLine, type LineIssue, type RequestStatus, type StoreKey } from '../data/entities'
import type { IssueInput, RequestCreateInput, ReturnInput } from '../data/validators'
import { StoreError, performerId, runCommand, type StoreContext } from './server'
import { ensureStockRecords } from './stockSetup'

export type StoreStage = 'manufacturing' | 'filling' | 'packing'

export const STORE_STAGE_KEYS: StoreStage[] = ['manufacturing', 'filling', 'packing']

export const STORE_LABEL: Record<StoreKey, string> = { rm: 'RM store', pm: 'PM store' }

const PRIMARY_PM = ['tube', 'bottle', 'jar', 'cap', 'pump', 'dropper', 'nozzle', 'lid', 'closure', 'container', 'spray', 'roll on', 'roll-on', 'sachet', 'pouch', 'can', 'vial', 'applicator']

const EPSILON = 0.000001

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function scopeOf(ctx: OrderContext): StockScope {
  return { em: ctx.em, tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export async function nextRequestCode(ctx: OrderContext): Promise<string> {
  const prefix = `DER/MR/${financialYear(new Date())}/`
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(code from length(?) + 1), '')::int) as max from dermat_store_requests
      where tenant_id = ? and organization_id = ? and code like ?`,
    [prefix, ctx.tenantId, ctx.organizationId, `${prefix}%`],
    'all',
    ctx.em.getTransactionContext(),
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`
}

export function awaitingReceipt(lines: StoreRequestLine[]): boolean {
  return lines.some((line) => num(line.issuedQty) > num(line.receivedQty) + EPSILON)
}

export function computeStatus(request: StoreRequest, lines: StoreRequestLine[]): RequestStatus {
  if (request.status === 'cancelled' || request.status === 'used') return request.status
  if (!lines.some((line) => num(line.issuedQty) > EPSILON)) return 'requested'
  const full = lines.every((line) => num(line.issuedQty) >= num(line.requiredQty) - EPSILON)
  if (!full) return 'partly_issued'
  return awaitingReceipt(lines) ? 'issued' : 'received'
}

function history(request: StoreRequest, action: string, by: string | null, note: string | null) {
  request.history = [...(request.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

export async function loadLines(ctx: OrderContext, requestId: string): Promise<StoreRequestLine[]> {
  return ctx.em.find(StoreRequestLine, { requestId }, { orderBy: { position: 'asc' } })
}

export async function findRequest(ctx: OrderContext, id: string): Promise<StoreRequest> {
  const request = await ctx.em.findOne(StoreRequest, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!request) throw new StoreError('Store request not found', 404)
  return request
}

async function packingTypes(ctx: OrderContext, productIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!productIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ record_id: string; value_text: string | null }>>(
    `select record_id, value_text from custom_field_values
      where record_id = any(?::text[]) and field_key in ('packing_item_type', 'pm_type') and deleted_at is null
        and tenant_id = ? and organization_id = ?`,
    [`{${productIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) if (row.value_text) result.set(row.record_id, row.value_text)
  return result
}

export function isPrimaryPack(title: string, type: string | null | undefined): boolean {
  const text = `${type ?? ''} ${title}`.toLowerCase()
  if (/\b(carton|label|leaflet|shipper|tray|box|sleeve|sticker|insert|spatula|shrink)\b/.test(text) && !type) return false
  if (type) return PRIMARY_PM.some((word) => type.toLowerCase().includes(word))
  return PRIMARY_PM.some((word) => new RegExp(`\\b${word}\\b`).test(text))
}

export function storeForKind(kind: string | null): StoreKey | null {
  if (kind === 'raw_material') return 'rm'
  if (kind === 'packing_material') return 'pm'
  return null
}

export type SuggestRow = {
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string | null
  store: StoreKey
  required: number
  requested: number
  suggested: number
  inStore: number
  reservedForOrder: number
}

export async function suggestLines(ctx: OrderContext, orderId: string, stageKey: StoreStage): Promise<{ rows: SuggestRow[]; missingBoms: string[] }> {
  const lines = await ctx.em.find(DermatOrderLine, { orderId })
  const boms = await approvedPackBoms(ctx, lines.map((line) => line.productId), orderId)
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const totals = new Map<string, { title: string; code: string | null; kind: string | null; unit: string | null; quantity: number }>()
  const missingBoms: string[] = []
  for (const line of lines) {
    const bom = boms.get(line.productId)
    if (!bom || bom.status !== 'approved') {
      missingBoms.push(products.get(line.productId)?.title ?? line.productId)
      continue
    }
    const header = await ctx.em.findOne(BomHeader, { id: bom.id })
    if (!header) continue
    const { requirements } = await explodeBom(ctx, header, Number(line.quantity), orderId)
    for (const row of requirements) {
      const current = totals.get(row.productId)
      totals.set(row.productId, { title: row.name, code: row.code, kind: row.kind, unit: row.unit, quantity: (current?.quantity ?? 0) + row.quantity })
    }
  }
  const ids = Array.from(totals.keys())
  const types = await packingTypes(ctx, ids)
  const wanted = ids.filter((id) => {
    const row = totals.get(id)!
    if (stageKey === 'manufacturing') return row.kind === 'raw_material'
    if (row.kind !== 'packing_material') return false
    const primary = isPrimaryPack(row.title, types.get(id))
    return stageKey === 'filling' ? primary : !primary
  })
  const existing = await ctx.em.find(StoreRequest, { orderId, stageKey, deletedAt: null, status: { $ne: 'cancelled' } })
  const existingLines = existing.length ? await ctx.em.find(StoreRequestLine, { requestId: { $in: existing.map((request) => request.id) } }) : []
  const requested = new Map<string, number>()
  for (const line of existingLines) requested.set(line.productId, (requested.get(line.productId) ?? 0) + num(line.requiredQty))
  const scope = scopeOf(ctx)
  const [warehouse, variants] = await Promise.all([dermatWarehouse(scope), variantsForProducts(scope, wanted)])
  const variantIds = Array.from(variants.values())
  const reservations = await reservationsFor(ctx, { orderIds: [orderId], productIds: wanted })
  const stockRows = warehouse
    ? [
        ...(await lotsAtLocation(scope, variantIds, warehouse.locations.get(LOCATION_CODES.rm) ?? '')),
        ...(await lotsAtLocation(scope, variantIds, warehouse.locations.get(LOCATION_CODES.pm) ?? '')),
      ]
    : []
  const rows = wanted.map((productId) => {
    const row = totals.get(productId)!
    const variantId = variants.get(productId)
    const required = round(row.quantity)
    const already = round(requested.get(productId) ?? 0)
    return {
      productId,
      title: row.title,
      code: row.code,
      kind: row.kind,
      unit: row.unit,
      store: storeForKind(row.kind) ?? 'pm',
      required,
      requested: already,
      suggested: round(Math.max(0, required - already)),
      inStore: round(stockRows.filter((entry) => entry.variantId === variantId && isUsable(entry)).reduce((sum, entry) => sum + entry.onHand, 0)),
      reservedForOrder: round(reservations.filter((entry) => entry.productId === productId).reduce((sum, entry) => sum + num(entry.quantity), 0)),
    }
  })
  rows.sort((a, b) => a.title.localeCompare(b.title))
  return { rows, missingBoms }
}

export async function createRequests(ctx: StoreContext, input: RequestCreateInput): Promise<StoreRequest[]> {
  const order = await ctx.em.findOne(DermatOrder, { id: input.orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!order) throw new StoreError('Order not found', 404)
  if (order.status === 'cancelled') throw new StoreError('This order is cancelled', 409)
  const stage = await ctx.em.findOne(DermatOrderStage, { orderId: order.id, stageKey: input.stageKey })
  const label = stageDef(input.stageKey)?.label ?? input.stageKey
  if (!stage || stage.status === 'waiting') throw new StoreError(`${label} has not started yet`, 409)
  if (stage.status === 'done' || stage.status === 'skipped') throw new StoreError(`${label} is already finished`, 409)
  const merged = new Map<string, number>()
  for (const line of input.lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity)
  const productIds = Array.from(merged.keys())
  const [products, variants] = await Promise.all([loadProducts(ctx, productIds), ensureStockRecords(ctx, productIds)])
  const byStore = new Map<StoreKey, string[]>()
  for (const productId of productIds) {
    const product = products.get(productId)
    if (!product) throw new StoreError('A product in the request was not found', 404)
    const store = storeForKind(product.kind)
    if (!store) throw new StoreError(`${product.title} is not a raw or packing material. Only those come from the store.`)
    if (!variants.get(productId)) throw new StoreError(`${product.title} has no stock record yet`)
    byStore.set(store, [...(byStore.get(store) ?? []), productId])
  }
  const byName = await currentUserName(ctx)
  const created: StoreRequest[] = []
  for (const [store, ids] of byStore) {
    const request = ctx.em.create(StoreRequest, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      code: await nextRequestCode(ctx),
      orderId: order.id,
      orderNo: order.orderNo,
      stageKey: input.stageKey,
      store,
      status: 'requested',
      notes: input.notes ?? null,
      requestedByName: byName,
      history: [{ action: 'requested', by: byName, at: new Date().toISOString(), note: input.notes ?? null }],
    })
    ctx.em.persist(request)
    await ctx.em.flush()
    ids.forEach((productId, index) => {
      ctx.em.persist(
        ctx.em.create(StoreRequestLine, {
          organizationId: ctx.organizationId,
          tenantId: ctx.tenantId,
          requestId: request.id,
          position: index + 1,
          productId,
          variantId: variants.get(productId)!,
          unit: products.get(productId)?.unit ?? 'pc',
          requiredQty: String(round(merged.get(productId) ?? 0)),
        }),
      )
    })
    await ctx.em.flush()
    created.push(request)
  }
  return created
}

async function locationsOrFail(ctx: StoreContext) {
  const warehouse = await dermatWarehouse(scopeOf(ctx))
  const production = warehouse?.locations.get(LOCATION_CODES.production)
  if (!warehouse || !production) throw new StoreError('The PRODUCTION store location is missing. Set it up under Masters → Stores.', 409)
  return { warehouseId: warehouse.warehouseId, locations: warehouse.locations, production }
}

function storeLocation(locations: Map<string, string>, store: StoreKey): string {
  const id = locations.get(LOCATION_CODES[store])
  if (!id) throw new StoreError(`The ${LOCATION_CODES[store]} store location is missing`, 409)
  return id
}

export async function issueMaterial(ctx: StoreContext, request: StoreRequest, input: IssueInput): Promise<void> {
  if (request.status === 'cancelled' || request.status === 'used') throw new StoreError('This request is closed', 409)
  const lines = await loadLines(ctx, request.id)
  const { warehouseId, locations, production } = await locationsOrFail(ctx)
  const from = storeLocation(locations, request.store)
  const byName = await currentUserName(ctx)
  const notes: string[] = []
  for (const entry of input.lines) {
    const line = lines.find((candidate) => candidate.id === entry.lineId)
    if (!line) throw new StoreError('A line of this request was not found', 404)
    const open = num(line.requiredQty) - num(line.issuedQty)
    if (entry.quantity > open + EPSILON) throw new StoreError(`Only ${round(open)} ${line.unit} is still needed on this line`)
    const { free, holders } = await freeFor(ctx, line.productId, request.orderId)
    if (entry.quantity > free + EPSILON) {
      const others = holders.map((holder) => `${holder.orderNo} (${round(num(holder.quantity))} ${line.unit})`).join(', ')
      throw new StoreError(
        others
          ? `Only ${round(free)} ${line.unit} is free: the rest is reserved for ${others}. Move that reservation to ${request.orderNo} in Planning first.`
          : `Only ${round(free)} ${line.unit} is in the ${STORE_LABEL[request.store]}`,
        409,
      )
    }
    const refreshed = (await lotsAtLocation(scopeOf(ctx), [line.variantId], from)).filter((lot) => isUsable(lot) && (!entry.lotId || lot.lotId === entry.lotId))
    let remaining = entry.quantity
    const issued: LineIssue[] = []
    try {
      for (const lot of refreshed) {
        if (remaining <= EPSILON) break
        const quantity = Math.min(remaining, Math.max(0, lot.free))
        if (quantity <= EPSILON) continue
        const result = await runCommand<{ movementId?: string }>(ctx, 'wms.inventory.move', {
          warehouseId,
          fromLocationId: from,
          toLocationId: production,
          catalogVariantId: line.variantId,
          ...(lot.lotId ? { lotId: lot.lotId } : {}),
          quantity: round(quantity),
          type: 'transfer',
          reason: `Issued to production for ${request.orderNo} (${request.code})`,
          reasonCode: 'store_issue',
          referenceType: 'transfer',
          referenceId: randomUUID(),
          performedBy: performerId(ctx),
          metadata: { storeRequestId: request.id, storeRequestCode: request.code, orderId: request.orderId, orderNo: request.orderNo },
        })
        issued.push({ lotId: lot.lotId, lotNumber: lot.lotNumber, quantity: round(quantity), used: 0, returned: 0, movementId: result?.movementId ?? null, by: byName, at: new Date().toISOString() })
        remaining -= quantity
      }
      if (remaining > EPSILON) throw new StoreError(`Not enough free stock in the ${STORE_LABEL[request.store]}: ${round(remaining)} ${line.unit} short`, 409)
    } catch (error) {
      for (const done of issued) {
        await runCommand(ctx, 'wms.inventory.move', {
          warehouseId,
          fromLocationId: production,
          toLocationId: from,
          catalogVariantId: line.variantId,
          ...(done.lotId ? { lotId: done.lotId } : {}),
          quantity: done.quantity,
          type: 'transfer',
          reason: `Issue undone for ${request.code}`,
          referenceType: 'transfer',
          referenceId: randomUUID(),
          performedBy: performerId(ctx),
        })
      }
      throw error
    }
    await consumeReservation({ ...scopeOf(ctx), userName: byName }, request.orderId, line.productId, entry.quantity, request.code)
    line.issuedQty = String(round(num(line.issuedQty) + entry.quantity))
    line.issues = [...(line.issues ?? []), ...issued]
    notes.push(`${round(entry.quantity)} ${line.unit}${issued.length ? ` (batch ${issued.map((item) => item.lotNumber ?? '—').join(', ')})` : ''}`)
  }
  request.status = computeStatus(request, lines)
  history(request, 'issued', byName, [notes.join(' · '), input.note].filter(Boolean).join(' — ') || null)
  request.updatedAt = new Date()
  await ctx.em.flush()
}

export async function receiveMaterial(ctx: StoreContext, request: StoreRequest, note: string | null): Promise<void> {
  if (request.status === 'cancelled' || request.status === 'used') throw new StoreError('This request is closed', 409)
  const lines = await loadLines(ctx, request.id)
  if (!awaitingReceipt(lines)) throw new StoreError('Nothing has been sent that is not already received', 409)
  for (const line of lines) line.receivedQty = line.issuedQty
  const byName = await currentUserName(ctx)
  request.receivedByName = byName
  request.receivedAt = new Date()
  request.status = computeStatus(request, lines)
  history(request, 'received', byName, note)
  request.updatedAt = new Date()
  await ctx.em.flush()
}

export async function returnMaterial(ctx: StoreContext, request: StoreRequest, input: ReturnInput): Promise<void> {
  if (request.status === 'cancelled' || request.status === 'used') throw new StoreError('This request is closed', 409)
  const lines = await loadLines(ctx, request.id)
  const { warehouseId, locations, production } = await locationsOrFail(ctx)
  const to = storeLocation(locations, request.store)
  const byName = await currentUserName(ctx)
  for (const entry of input.lines) {
    const line = lines.find((candidate) => candidate.id === entry.lineId)
    if (!line) throw new StoreError('A line of this request was not found', 404)
    const inHand = num(line.receivedQty) - num(line.usedQty) - num(line.returnedQty)
    if (entry.quantity > inHand + EPSILON) throw new StoreError(`Only ${round(inHand)} ${line.unit} is with production for this line`)
    let remaining = entry.quantity
    const issues = [...(line.issues ?? [])]
    for (const issue of issues) {
      if (remaining <= EPSILON) break
      const left = issue.quantity - issue.used - issue.returned
      const quantity = Math.min(remaining, left)
      if (quantity <= EPSILON) continue
      await runCommand(ctx, 'wms.inventory.move', {
        warehouseId,
        fromLocationId: production,
        toLocationId: to,
        catalogVariantId: line.variantId,
        ...(issue.lotId ? { lotId: issue.lotId } : {}),
        quantity: round(quantity),
        type: 'transfer',
        reason: `Returned to store from ${request.orderNo} (${request.code})`,
        reasonCode: 'store_return',
        referenceType: 'transfer',
        referenceId: randomUUID(),
        performedBy: performerId(ctx),
        metadata: { storeRequestId: request.id, storeRequestCode: request.code, orderId: request.orderId, orderNo: request.orderNo },
      })
      issue.returned = round(issue.returned + quantity)
      remaining -= quantity
    }
    line.issues = issues
    line.returnedQty = String(round(num(line.returnedQty) + entry.quantity))
  }
  history(request, 'returned', byName, input.note)
  request.updatedAt = new Date()
  await ctx.em.flush()
}

export async function cancelRequest(ctx: StoreContext, request: StoreRequest, note: string): Promise<void> {
  const lines = await loadLines(ctx, request.id)
  if (lines.some((line) => num(line.issuedQty) > EPSILON)) throw new StoreError('The store has already issued material. Return it instead of cancelling.', 409)
  if (request.status === 'cancelled') return
  request.status = 'cancelled'
  history(request, 'cancelled', await currentUserName(ctx), note)
  request.updatedAt = new Date()
  await ctx.em.flush()
}

export async function consumeForStage(ctx: StoreContext, orderId: string, stageKey: string, batchNo: string | null): Promise<string[]> {
  const requests = await ctx.em.find(StoreRequest, {
    orderId,
    stageKey,
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    deletedAt: null,
    status: { $nin: ['cancelled', 'used'] },
  })
  if (!requests.length) return []
  const { warehouseId, production } = await locationsOrFail(ctx)
  const byName = await currentUserName(ctx)
  const problems: string[] = []
  for (const request of requests) {
    const lines = await loadLines(ctx, request.id)
    for (const line of lines) {
      const issues = [...(line.issues ?? [])]
      let usedNow = 0
      for (const issue of issues) {
        const left = issue.quantity - issue.used - issue.returned
        if (left <= EPSILON) continue
        try {
          await runCommand(ctx, 'wms.inventory.adjust', {
            warehouseId,
            locationId: production,
            catalogVariantId: line.variantId,
            ...(issue.lotId ? { lotId: issue.lotId } : {}),
            delta: -round(left),
            reason: `Used in ${stageDef(stageKey)?.label ?? stageKey}${batchNo ? ` batch ${batchNo}` : ''} for ${request.orderNo} (${request.code})`,
            reasonCode: 'production_use',
            referenceType: 'transfer',
            referenceId: randomUUID(),
            performedBy: performerId(ctx),
            metadata: { storeRequestId: request.id, storeRequestCode: request.code, orderId: request.orderId, orderNo: request.orderNo },
          })
          issue.used = round(issue.used + left)
          usedNow += left
        } catch {
          problems.push(`${request.code}: could not record use of one batch`)
        }
      }
      line.issues = issues
      line.usedQty = String(round(num(line.usedQty) + usedNow))
    }
    request.status = 'used'
    request.usedAt = new Date()
    history(request, 'used', byName, batchNo ? `Batch ${batchNo}` : null)
    request.updatedAt = new Date()
  }
  await ctx.em.flush()
  return problems
}

export async function storeBlocking(ctx: OrderContext, orderId: string, stageKey: string): Promise<string | null> {
  if (!STORE_STAGE_KEYS.includes(stageKey as StoreStage)) return null
  const requests = await ctx.em.find(StoreRequest, { orderId, stageKey, deletedAt: null, status: { $ne: 'cancelled' } })
  if (!requests.length) {
    const { rows } = await suggestLines(ctx, orderId, stageKey as StoreStage)
    if (!rows.some((row) => row.required > 0)) return null
    return 'Ask the store for the material first (Store request)'
  }
  const lines = await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } })
  const waiting = requests.filter((request) => request.status === 'requested')
  if (waiting.length) return `The store has not issued anything yet on ${waiting.map((request) => request.code).join(', ')}`
  const unreceived = requests.filter((request) => awaitingReceipt(lines.filter((line) => line.requestId === request.id)))
  if (unreceived.length) return `Confirm you received the material on ${unreceived.map((request) => request.code).join(', ')}`
  return null
}

export type StageRequestSummary = { id: string; code: string; store: StoreKey; status: RequestStatus; awaitingReceipt: boolean; lineCount: number; issuedLines: number }

export async function requestsForOrder(ctx: OrderContext, orderId: string): Promise<Record<string, StageRequestSummary[]>> {
  const requests = await ctx.em.find(StoreRequest, { orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  if (!requests.length) return {}
  const lines = await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } })
  const result: Record<string, StageRequestSummary[]> = {}
  for (const request of requests) {
    const own = lines.filter((line) => line.requestId === request.id)
    ;(result[request.stageKey] ??= []).push({
      id: request.id,
      code: request.code,
      store: request.store,
      status: request.status,
      awaitingReceipt: awaitingReceipt(own),
      lineCount: own.length,
      issuedLines: own.filter((line) => num(line.issuedQty) > EPSILON).length,
    })
  }
  return result
}

export async function requestView(ctx: StoreContext, request: StoreRequest, withStock: boolean) {
  const lines = await loadLines(ctx, request.id)
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  let stock: Awaited<ReturnType<typeof lotsAtLocation>> = []
  let reservations: Awaited<ReturnType<typeof reservationsFor>> = []
  if (withStock) {
    const warehouse = await dermatWarehouse(scopeOf(ctx))
    const location = warehouse?.locations.get(LOCATION_CODES[request.store])
    const variantIds = lines.map((line) => line.variantId)
    if (location) stock = await lotsAtLocation(scopeOf(ctx), variantIds, location)
    reservations = await reservationsFor(ctx, { orderIds: [request.orderId], productIds: lines.map((line) => line.productId) })
  }
  const freeByProduct = new Map<string, Awaited<ReturnType<typeof freeFor>>>()
  if (withStock) for (const line of lines) freeByProduct.set(line.productId, await freeFor(ctx, line.productId, request.orderId))
  return {
    id: request.id,
    code: request.code,
    orderId: request.orderId,
    orderNo: request.orderNo,
    stageKey: request.stageKey,
    stageLabel: stageDef(request.stageKey)?.label ?? request.stageKey,
    store: request.store,
    storeLabel: STORE_LABEL[request.store],
    status: request.status,
    awaitingReceipt: awaitingReceipt(lines),
    notes: request.notes ?? null,
    requestedByName: request.requestedByName ?? null,
    receivedByName: request.receivedByName ?? null,
    receivedAt: request.receivedAt ? request.receivedAt.toISOString() : null,
    usedAt: request.usedAt ? request.usedAt.toISOString() : null,
    history: request.history ?? [],
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    lines: lines.map((line) => {
      const product = products.get(line.productId)
      const reservedForOrder = reservations.filter((entry) => entry.productId === line.productId).reduce((sum, entry) => sum + num(entry.quantity), 0)
      const lots = stock.filter((entry) => entry.variantId === line.variantId)
      return {
        id: line.id,
        productId: line.productId,
        title: product?.title ?? '(deleted product)',
        code: product?.code ?? null,
        unit: line.unit,
        required: num(line.requiredQty),
        issued: num(line.issuedQty),
        received: num(line.receivedQty),
        used: num(line.usedQty),
        returned: num(line.returnedQty),
        withProduction: round(num(line.receivedQty) - num(line.usedQty) - num(line.returnedQty)),
        issues: line.issues ?? [],
        reservedForOrder: round(reservedForOrder),
        lots: lots.filter(isUsable).map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, onHand: lot.onHand, free: round(lot.free), expiresAt: lot.expiresAt })),
        inStore: round(lots.filter(isUsable).reduce((sum, lot) => sum + lot.onHand, 0)),
        free: round(freeByProduct.get(line.productId)?.free ?? 0),
        heldByOthers: (freeByProduct.get(line.productId)?.holders ?? []).map((holder) => ({ orderId: holder.orderId, orderNo: holder.orderNo, quantity: round(num(holder.quantity)) })),
      }
    }),
  }
}
