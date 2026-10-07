import type { StoreContext } from '../../cc_store/lib/server'
import { loadProducts } from '../../cc_orders/lib/server'
import { Reactor, ResinBatch, type PlantHistoryEntry, type ResinMaterialLine } from '../data/entities'
import { RESIN_GRADES, type ResinBatchInput } from '../data/validators'
import { PlantError } from './server'
import { consumeLots, freeLots, kg3, lotOnHand, movementTime, pickLots, plantStock, produceLot, returnLots, type PickedLot } from './plantStock'

export const CHEMICAL_PLACES = ['wh_a', 'wh_b', 'floor'] as const

export const STANDARD_MATERIALS = ['Phenol', 'Formaldehyde', 'Cardinol', 'Liquid Ammonia', 'Caustic Soda Flakes', 'Methanol', 'Oxalic Acid']

export const REOPEN_HOURS = 24

const SOURCE = 'cc_production.resin'

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function historyEntry(action: string, by: string | null, note: string | null = null): PlantHistoryEntry {
  return { action, by, at: new Date().toISOString(), note }
}

function ddmmyy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}${month}${year.slice(2)}`
}

export async function nextBatchNo(ctx: StoreContext, isoDate: string): Promise<string> {
  const prefix = `CCCPL/${ddmmyy(isoDate)}/`
  const rows = await ctx.em.getConnection().execute<Array<{ batch_no: string }>>(
    'select batch_no from cc_resin_batches where organization_id = ? and tenant_id = ? and deleted_at is null and batch_no like ?',
    [ctx.organizationId, ctx.tenantId, `${prefix}%`],
  )
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.batch_no.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(highest + 1).padStart(2, '0')}`
}

type ChemicalRow = { id: string; title: string; unit: string | null }

export async function chemicalProducts(ctx: StoreContext): Promise<ChemicalRow[]> {
  return ctx.em.getConnection().execute<ChemicalRow[]>(
    `select p.id, p.title, p.default_unit as unit from catalog_products p
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'chemical'
      order by p.title asc`,
    [ctx.tenantId, ctx.organizationId],
  )
}

export async function resinProductFor(ctx: StoreContext, grade: string): Promise<{ id: string; title: string } | null> {
  const [row] = await ctx.em.getConnection().execute<Array<{ id: string; title: string }>>(
    `select p.id, p.title from catalog_products p
       join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.field_key = 'resin_grade' and v.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'resin' and upper(v.value_text) = upper(?)
      order by p.created_at asc limit 1`,
    [ctx.tenantId, ctx.organizationId, grade],
  )
  return row ?? null
}

export async function resinSetup(ctx: StoreContext, isoDate: string | null) {
  const reactors = await ctx.em.find(Reactor, { ...scope(ctx), deletedAt: null, isActive: true }, { orderBy: { code: 'asc' } })
  const chemicals = await chemicalProducts(ctx)
  const stock = await plantStock(ctx, chemicals.map((chemical) => chemical.id))
  const lots = await freeLots(ctx, stock, chemicals.map((chemical) => chemical.id), [...CHEMICAL_PLACES])
  const standardIndex = (title: string) => STANDARD_MATERIALS.findIndex((name) => name.toLowerCase() === title.toLowerCase())
  return {
    nextBatchNo: isoDate ? await nextBatchNo(ctx, isoDate) : null,
    reactors: reactors.map((reactor) => ({ id: reactor.id, code: reactor.code, capacityKg: num(reactor.capacityKg) })),
    grades: [...RESIN_GRADES],
    chemicals: chemicals
      .map((chemical) => {
        const own = lots.get(chemical.id) ?? []
        const index = standardIndex(chemical.title)
        return {
          id: chemical.id,
          title: chemical.title,
          unit: chemical.unit ?? 'kg',
          standard: index >= 0,
          letter: index >= 0 ? String.fromCharCode(65 + index) : null,
          free: kg3(own.reduce((sum, lot) => sum + lot.free, 0)),
          lots: own.map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, place: lot.place, free: lot.free, receivedAt: lot.receivedAt })),
        }
      })
      .sort((left, right) => (left.letter ?? 'Z').localeCompare(right.letter ?? 'Z') || left.title.localeCompare(right.title)),
  }
}

export async function findBatch(ctx: StoreContext, id: string): Promise<ResinBatch> {
  const batch = await ctx.em.findOne(ResinBatch, { id, ...scope(ctx), deletedAt: null })
  if (!batch) throw new PlantError('Resin batch not found', 404)
  return batch
}

async function materialLines(ctx: StoreContext, input: ResinBatchInput['materials']): Promise<ResinMaterialLine[]> {
  const used = input.filter((line) => line.kg > 0)
  const chemicals = new Map((await chemicalProducts(ctx)).map((chemical) => [chemical.id, chemical]))
  return used.map((line) => {
    const chemical = chemicals.get(line.productId)
    if (!chemical) throw new PlantError('Only chemicals can go into a resin batch')
    return { productId: line.productId, title: chemical.title, kg: kg3(line.kg), lotId: line.lotId ?? null, lots: [] }
  })
}

async function applyInput(ctx: StoreContext, batch: ResinBatch, input: ResinBatchInput) {
  const reactor = await ctx.em.findOne(Reactor, { id: input.reactorId, ...scope(ctx), deletedAt: null })
  if (!reactor) throw new PlantError('Pick the vessel (reactor) from the list')
  batch.batchDate = input.batchDate
  batch.reactorId = reactor.id
  batch.reactorCode = reactor.code
  batch.grade = input.grade
  batch.materials = await materialLines(ctx, input.materials)
  batch.process = input.process
  batch.tests = input.tests
  batch.waterRemovedKg = input.waterRemovedKg === null ? null : String(kg3(input.waterRemovedKg))
  batch.yieldKg = input.yieldKg === null ? null : String(kg3(input.yieldKg))
  batch.notes = input.notes ?? null
}

async function ensureUniqueNo(ctx: StoreContext, batchNo: string, exceptId: string | null) {
  const clash = await ctx.em.findOne(ResinBatch, { ...scope(ctx), batchNo, deletedAt: null, ...(exceptId ? { id: { $ne: exceptId } } : {}) })
  if (clash) throw new PlantError(`Batch No. ${batchNo} is already used`, 409)
}

export async function createBatch(ctx: StoreContext, input: ResinBatchInput, byName: string | null): Promise<ResinBatch> {
  const batchNo = input.batchNo?.trim() || (await nextBatchNo(ctx, input.batchDate))
  await ensureUniqueNo(ctx, batchNo, null)
  const batch = ctx.em.create(ResinBatch, {
    ...scope(ctx),
    batchNo,
    batchDate: input.batchDate,
    reactorId: input.reactorId,
    reactorCode: '',
    grade: input.grade,
    materials: [],
    process: input.process,
    tests: input.tests,
    updatedByName: byName,
    history: [historyEntry('created', byName)],
  })
  await applyInput(ctx, batch, input)
  ctx.em.persist(batch)
  await ctx.em.flush()
  return batch
}

export async function updateBatch(ctx: StoreContext, batch: ResinBatch, input: ResinBatchInput, byName: string | null): Promise<ResinBatch> {
  if (batch.status !== 'draft') throw new PlantError('This batch is posted. Reopen it first to change it.', 409)
  if (input.batchNo && input.batchNo.trim() !== batch.batchNo) {
    await ensureUniqueNo(ctx, input.batchNo.trim(), batch.id)
    batch.batchNo = input.batchNo.trim()
  }
  await applyInput(ctx, batch, input)
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), historyEntry('edited', byName)]
  await ctx.em.flush()
  return batch
}

type Done = { productId: string; picks: PickedLot[] }

async function consumeMaterials(ctx: StoreContext, batch: ResinBatch, reason: string, reasonCode: string) {
  const productIds = [...new Set(batch.materials.map((line) => line.productId))]
  const stock = await plantStock(ctx, productIds)
  const available = await freeLots(ctx, stock, productIds, [...CHEMICAL_PLACES])
  const planned = batch.materials.map((line) => {
    const lots = available.get(line.productId) ?? []
    const picks = pickLots(lots, line.kg, line.title, line.lotId)
    for (const pick of picks) {
      const lot = lots.find((entry) => entry.lotId === pick.lotId)
      if (lot) lot.free = kg3(lot.free - pick.kg)
    }
    return { line, picks }
  })
  const done: Done[] = []
  const metadata = { source: SOURCE, batchId: batch.id, batchNo: batch.batchNo }
  try {
    for (const entry of planned) {
      await consumeLots(ctx, stock, entry.line.productId, entry.picks, { reason: `${reason} ${batch.batchNo}`, reasonCode, performedAt: movementTime(batch.batchDate), metadata })
      done.push({ productId: entry.line.productId, picks: entry.picks })
    }
  } catch (error) {
    for (const entry of done) await returnLots(ctx, stock, entry.productId, entry.picks, { reason: `Undo ${batch.batchNo}`, reasonCode: 'resin_undo', performedAt: movementTime(batch.batchDate), metadata })
    throw error
  }
  batch.materials = planned.map((entry) => ({ ...entry.line, lots: entry.picks }))
  return { stock, done, metadata }
}

export async function postBatch(ctx: StoreContext, batch: ResinBatch, byName: string | null): Promise<ResinBatch> {
  if (batch.status !== 'draft') throw new PlantError('This batch is already posted', 409)
  const yieldKg = num(batch.yieldKg) ?? 0
  if (!batch.materials.length) throw new PlantError('Enter the kg of at least one material')
  if (!(yieldKg > 0)) throw new PlantError('Enter the resin yield (kg) before posting')
  const resin = await resinProductFor(ctx, batch.grade)
  if (!resin) throw new PlantError(`There is no resin item for grade ${batch.grade}. Add it under Items → Resin.`, 409)
  const { stock, done, metadata } = await consumeMaterials(ctx, batch, 'Used in resin batch', 'resin_consume')
  const resinStock = await plantStock(ctx, [resin.id])
  try {
    batch.resinLotId = await produceLot(ctx, resinStock, {
      productId: resin.id,
      place: 'tank',
      lotNumber: batch.batchNo,
      existingLotId: batch.resinProductId === resin.id ? batch.resinLotId ?? null : null,
      kg: yieldKg,
      manufacturedAt: batch.batchDate,
      reason: `Resin from batch ${batch.batchNo}`,
      reasonCode: 'resin_produce',
      performedAt: movementTime(batch.batchDate),
      metadata,
    })
  } catch (error) {
    for (const entry of done) await returnLots(ctx, stock, entry.productId, entry.picks, { reason: `Undo ${batch.batchNo}`, reasonCode: 'resin_undo', performedAt: movementTime(batch.batchDate), metadata })
    throw error
  }
  batch.resinProductId = resin.id
  batch.resinLotNumber = batch.batchNo
  batch.status = 'posted'
  batch.failReason = null
  batch.postedAt = new Date()
  batch.postedByName = byName
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), historyEntry('posted', byName, `${kg3(yieldKg)} kg ${resin.title} into the resin tank`)]
  await ctx.em.flush()
  return batch
}

export async function failBatch(ctx: StoreContext, batch: ResinBatch, reason: string, byName: string | null): Promise<ResinBatch> {
  if (batch.status !== 'draft') throw new PlantError('Only a batch that is not posted can be marked failed', 409)
  if (!reason.trim()) throw new PlantError('Write why the batch failed')
  if (!batch.materials.length) throw new PlantError('Enter the kg of the materials that were charged')
  await consumeMaterials(ctx, batch, 'Failed resin batch (scrap)', 'resin_failed')
  batch.status = 'failed'
  batch.failReason = reason.trim()
  batch.postedAt = new Date()
  batch.postedByName = byName
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), historyEntry('failed', byName, reason.trim())]
  await ctx.em.flush()
  return batch
}

export function reopenDeadline(batch: ResinBatch): Date | null {
  return batch.postedAt ? new Date(batch.postedAt.getTime() + REOPEN_HOURS * 3600_000) : null
}

export async function reopenBatch(ctx: StoreContext, batch: ResinBatch, byName: string | null): Promise<ResinBatch> {
  if (batch.status === 'draft') throw new PlantError('This batch is not posted', 409)
  const deadline = reopenDeadline(batch)
  if (deadline && deadline.getTime() < Date.now()) throw new PlantError(`A batch can only be reopened within ${REOPEN_HOURS} hours of posting`, 409)
  const metadata = { source: SOURCE, batchId: batch.id, batchNo: batch.batchNo }
  const performedAt = movementTime(batch.batchDate)
  if (batch.status === 'posted' && batch.resinProductId && batch.resinLotId) {
    const resinStock = await plantStock(ctx, [batch.resinProductId])
    const yieldKg = num(batch.yieldKg) ?? 0
    const left = await lotOnHand(ctx, resinStock, batch.resinProductId, batch.resinLotId, 'tank')
    if (left + 0.0005 < yieldKg) throw new PlantError(`${kg3(yieldKg - left)} kg of this resin is already used. It cannot be reopened.`, 409)
    await consumeLots(ctx, resinStock, batch.resinProductId, [{ lotId: batch.resinLotId, lotNumber: batch.resinLotNumber ?? null, place: 'tank', kg: yieldKg }], { reason: `Reopened resin batch ${batch.batchNo}`, reasonCode: 'resin_reopen', performedAt, metadata })
  }
  const productIds = [...new Set(batch.materials.map((line) => line.productId))]
  const stock = await plantStock(ctx, productIds)
  for (const line of batch.materials) await returnLots(ctx, stock, line.productId, line.lots, { reason: `Reopened resin batch ${batch.batchNo}`, reasonCode: 'resin_reopen', performedAt, metadata })
  batch.materials = batch.materials.map((line) => ({ ...line, lots: [] }))
  batch.status = 'draft'
  batch.postedAt = null
  batch.postedByName = null
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), historyEntry('reopened', byName, 'Stock movements reversed')]
  await ctx.em.flush()
  return batch
}

export async function signBatch(ctx: StoreContext, batch: ResinBatch, who: 'chemist' | 'incharge', byName: string | null): Promise<ResinBatch> {
  if (who === 'chemist') {
    batch.chemistSign = byName ?? 'Signed'
    batch.chemistSignedAt = new Date()
  } else {
    batch.inchargeSign = byName ?? 'Signed'
    batch.inchargeSignedAt = new Date()
  }
  batch.history = [...(batch.history ?? []), historyEntry(who === 'chemist' ? 'signed_chemist' : 'signed_incharge', byName)]
  await ctx.em.flush()
  return batch
}

export async function deleteBatch(ctx: StoreContext, batch: ResinBatch, byName: string | null) {
  if (batch.status !== 'draft') throw new PlantError('Only a draft batch can be deleted. Reopen it first.', 409)
  batch.deletedAt = new Date()
  batch.updatedByName = byName
  await ctx.em.flush()
}

export function batchTotals(batch: Pick<ResinBatch, 'materials' | 'yieldKg'>) {
  const totalInputKg = kg3(batch.materials.reduce((sum, line) => sum + line.kg, 0))
  const yieldKg = num(batch.yieldKg)
  return { totalInputKg, yieldKg, yieldPct: yieldKg && totalInputKg ? Math.round((yieldKg / totalInputKg) * 1000) / 10 : null }
}

export function batchRow(batch: ResinBatch) {
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    batchDate: batch.batchDate,
    reactorCode: batch.reactorCode,
    grade: batch.grade,
    status: batch.status,
    failReason: batch.failReason ?? null,
    ...batchTotals(batch),
    chemistSigned: Boolean(batch.chemistSign),
    inchargeSigned: Boolean(batch.inchargeSign),
    updatedAt: batch.updatedAt.toISOString(),
  }
}

async function lotSources(ctx: StoreContext, lotIds: string[]): Promise<Map<string, { grnCode: string | null; grnId: string | null }>> {
  const result = new Map<string, { grnCode: string | null; grnId: string | null }>()
  if (!lotIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; metadata: Record<string, unknown> | null }>>(
    'select id, metadata from wms_inventory_lots where id = any(?::uuid[]) and organization_id = ?',
    [`{${lotIds.join(',')}}`, ctx.organizationId],
  )
  for (const row of rows) result.set(row.id, { grnCode: typeof row.metadata?.grnCode === 'string' ? row.metadata.grnCode : null, grnId: typeof row.metadata?.grnId === 'string' ? row.metadata.grnId : null })
  return result
}

export async function batchView(ctx: StoreContext, batch: ResinBatch) {
  const lotIds = batch.materials.flatMap((line) => line.lots.map((lot) => lot.lotId))
  const sources = await lotSources(ctx, lotIds)
  let resinLeftKg: number | null = null
  let resinTitle: string | null = null
  if (batch.status === 'posted' && batch.resinProductId && batch.resinLotId) {
    const stock = await plantStock(ctx, [batch.resinProductId])
    resinLeftKg = await lotOnHand(ctx, stock, batch.resinProductId, batch.resinLotId, 'tank')
    resinTitle = (await loadProducts(ctx, [batch.resinProductId])).get(batch.resinProductId)?.title ?? null
  }
  const recent = await ctx.em.find(ResinBatch, { ...scope(ctx), grade: batch.grade, status: 'posted', deletedAt: null, id: { $ne: batch.id } }, { orderBy: { batchDate: 'desc', createdAt: 'desc' }, limit: 10 })
  const recentRows = recent.map((entry) => ({ id: entry.id, batchNo: entry.batchNo, batchDate: entry.batchDate, ...batchTotals(entry) }))
  const pcts = recentRows.map((entry) => entry.yieldPct).filter((value): value is number => value !== null)
  const deadline = reopenDeadline(batch)
  return {
    ...batchRow(batch),
    reactorId: batch.reactorId,
    materials: batch.materials.map((line) => ({
      ...line,
      lots: line.lots.map((lot) => ({ ...lot, ...(sources.get(lot.lotId) ?? { grnCode: null, grnId: null }) })),
    })),
    process: batch.process,
    tests: batch.tests,
    waterRemovedKg: num(batch.waterRemovedKg),
    notes: batch.notes ?? null,
    chemistSign: batch.chemistSign ?? null,
    chemistSignedAt: batch.chemistSignedAt?.toISOString() ?? null,
    inchargeSign: batch.inchargeSign ?? null,
    inchargeSignedAt: batch.inchargeSignedAt?.toISOString() ?? null,
    postedAt: batch.postedAt?.toISOString() ?? null,
    postedByName: batch.postedByName ?? null,
    reopenUntil: batch.status === 'draft' ? null : deadline?.toISOString() ?? null,
    canReopen: batch.status !== 'draft' && Boolean(deadline && deadline.getTime() >= Date.now()),
    resin: batch.status === 'posted' && batch.resinLotId ? { productId: batch.resinProductId ?? null, title: resinTitle, lotId: batch.resinLotId, lotNumber: batch.resinLotNumber ?? null, leftKg: resinLeftKg } : null,
    wentTo: [] as Array<{ id: string; label: string; kg: number }>,
    compare: { batches: recentRows, averagePct: pcts.length ? Math.round((pcts.reduce((sum, value) => sum + value, 0) / pcts.length) * 10) / 10 : null },
    history: batch.history ?? [],
    createdAt: batch.createdAt.toISOString(),
  }
}

export async function listBatches(ctx: StoreContext, query: { status: string; grade?: string; month?: string; search?: string; page: number; pageSize: number }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.status !== 'all') where.status = query.status
  if (query.grade) where.grade = query.grade
  if (query.month) where.batchDate = { $like: `${query.month}-%` }
  if (query.search) where.batchNo = { $ilike: `%${query.search.replace(/[%_]/g, '')}%` }
  const [rows, total] = await ctx.em.findAndCount(ResinBatch, where, { orderBy: { batchDate: 'desc', batchNo: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize })
  const counts = await ctx.em.getConnection().execute<Array<{ status: string; count: string }>>(
    'select status, count(*) as count from cc_resin_batches where organization_id = ? and tenant_id = ? and deleted_at is null group by status',
    [ctx.organizationId, ctx.tenantId],
  )
  return { items: rows.map(batchRow), total, page: query.page, pageSize: query.pageSize, counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])) }
}
