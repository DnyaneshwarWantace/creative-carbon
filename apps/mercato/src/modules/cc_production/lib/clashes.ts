import type { StoreContext } from '../../cc_store/lib/server'
import { CoatingSheet, MouldingEntry, SyncClash } from '../data/entities'
import { coatingSheetInputSchema, mouldingEntrySchema } from '../data/validators'
import { updateSheet } from './coating'
import { saveShift } from './moulding'
import { PlantError } from './server'
import { diffSnapshot } from '../../cc_audit/lib/activity'

export type ClashInput = { screen: string; recordRef: string; detail: string | null; path?: string | null; method?: string | null; body?: Record<string, unknown> | null; queuedAt?: string | null }

const EDIT_FEATURE: Record<string, string> = {
  coating_sheet: 'cc_production.coating.enter',
  moulding_shift: 'cc_production.moulding.enter',
}

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function sheetVersion(sheet: CoatingSheet): Record<string, unknown> {
  return {
    sheetDate: sheet.sheetDate,
    dryerId: sheet.dryerId,
    rows: sheet.rows.map((row) => ({ sn: row.sn, clothProductId: row.clothProductId, gsm: row.gsm, kushan: row.kushan, treatedWeight: row.treatedWeight, rawKg: row.rawKg, balanceRawKg: row.balanceRawKg, coatedNos: row.coatedNos, resinLotId: row.resinLotId, rcPct: row.rcPct, vcPct: row.vcPct })),
    slots: sheet.slots,
    notes: sheet.notes ?? null,
  }
}

function entryVersion(item: MouldingEntry): Record<string, unknown> {
  const keys = Object.keys(mouldingEntrySchema.shape) as Array<keyof MouldingEntry>
  return Object.fromEntries(keys.map((key) => [key, item[key] ?? null]))
}

async function shiftItems(ctx: StoreContext, entryDate: string, shift: number) {
  return ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate, shift, deletedAt: null }, { orderBy: { pressNumber: 'asc' } })
}

async function capture(ctx: StoreContext, input: ClashInput): Promise<Pick<SyncClash, 'recordType' | 'recordId' | 'serverVersion' | 'serverByName'> | null> {
  const body = input.body ?? {}
  if (input.path === '/api/cc_production/coating/sheets' && typeof body.id === 'string') {
    const sheet = await ctx.em.findOne(CoatingSheet, { ...scope(ctx), id: body.id, deletedAt: null })
    if (!sheet) return null
    return { recordType: 'coating_sheet', recordId: sheet.id, serverVersion: sheetVersion(sheet), serverByName: sheet.updatedByName ?? null }
  }
  if (input.path === '/api/cc_production/moulding' && typeof body.entryDate === 'string' && body.shift !== undefined) {
    const items = await shiftItems(ctx, body.entryDate, Number(body.shift))
    const latest = items.reduce<MouldingEntry | null>((best, item) => (!best || item.updatedAt > best.updatedAt ? item : best), null)
    return { recordType: 'moulding_shift', recordId: `${body.entryDate}:${Number(body.shift)}`, serverVersion: { entryDate: body.entryDate, shift: Number(body.shift), entries: items.filter((item) => item.status === 'draft').map(entryVersion) }, serverByName: latest?.updatedByName ?? null }
  }
  return null
}

export async function logClash(ctx: StoreContext, input: ClashInput, byName: string | null) {
  const captured = await capture(ctx, input)
  const clash = ctx.em.create(SyncClash, {
    ...scope(ctx),
    screen: input.screen,
    recordRef: input.recordRef,
    detail: input.detail,
    byName,
    path: input.path ?? null,
    offlineVersion: input.body ?? null,
    queuedAt: input.queuedAt ? new Date(input.queuedAt) : null,
    ...(captured ?? {}),
  })
  ctx.em.persist(clash)
  await ctx.em.flush()
  const { recordActivity } = await import('../../cc_audit/lib/activity')
  recordActivity(ctx.em, ctx, { recordType: 'sync_clash', recordId: clash.id, action: 'detected', kind: 'system', source: 'phone', summary: `${input.screen} ${input.recordRef}: saved offline${byName ? ` by ${byName}` : ''}, changed meanwhile${captured?.serverByName ? ` by ${captured.serverByName}` : ''}. The offline save was kept.`, actorUserId: ctx.userId ?? null, actorName: byName })
  await ctx.em.flush()
  return clash
}

export function clashEditFeature(clash: SyncClash): string | null {
  return clash.recordType ? EDIT_FEATURE[clash.recordType] ?? null : null
}

export function recordLink(clash: SyncClash): string | null {
  if (clash.recordType === 'coating_sheet' && clash.recordId) return `/backend/coating/${clash.recordId}`
  if (clash.recordType === 'moulding_shift' && clash.recordId) {
    const [date, shift] = clash.recordId.split(':')
    return `/backend/moulding?date=${date}&shift=${shift}`
  }
  return null
}

export function clashView(clash: SyncClash) {
  return {
    id: clash.id,
    screen: clash.screen,
    recordRef: clash.recordRef,
    detail: clash.detail ?? null,
    byName: clash.byName ?? null,
    at: clash.createdAt.toISOString(),
    queuedAt: clash.queuedAt ? clash.queuedAt.toISOString() : null,
    recordType: clash.recordType ?? null,
    recordId: clash.recordId ?? null,
    recordHref: recordLink(clash),
    offlineVersion: clash.offlineVersion ?? null,
    serverVersion: clash.serverVersion ?? null,
    serverByName: clash.serverByName ?? null,
    canPick: Boolean(clash.serverVersion && clash.offlineVersion),
    differences: clash.serverVersion && clash.offlineVersion ? diffSnapshot(clash.serverVersion, clash.offlineVersion, { rows: 'Row', entries: 'Machine row', slots: 'Slot' }) : [],
    status: clash.status,
    kept: clash.kept ?? null,
    resolvedAt: clash.resolvedAt ? clash.resolvedAt.toISOString() : null,
    resolvedByName: clash.resolvedByName ?? null,
    resolveReason: clash.resolveReason ?? null,
    updatedAt: clash.updatedAt.toISOString(),
  }
}

export async function listClashes(ctx: StoreContext, status: 'open' | 'resolved' | 'all') {
  const rows = await ctx.em.find(SyncClash, { ...scope(ctx), ...(status === 'all' ? {} : { status }) }, { orderBy: { createdAt: 'desc' }, limit: 200 })
  return rows.map(clashView)
}

export async function findClash(ctx: StoreContext, id: string) {
  const clash = await ctx.em.findOne(SyncClash, { ...scope(ctx), id })
  if (!clash) throw new PlantError('Sync clash not found', 404)
  return clash
}

export async function pickVersion(ctx: StoreContext, clash: SyncClash, keep: 'offline' | 'server', byName: string | null, reason: string) {
  if (clash.status === 'resolved') throw new PlantError('This clash is already settled', 409)
  if (keep === 'server') {
    if (!clash.serverVersion) throw new PlantError('The other version was not captured for this clash; correct the record on its own page', 409)
    if (clash.recordType === 'coating_sheet' && clash.recordId) {
      const sheet = await ctx.em.findOne(CoatingSheet, { ...scope(ctx), id: clash.recordId, deletedAt: null })
      if (!sheet) throw new PlantError('The dryer sheet no longer exists', 409)
      await updateSheet(ctx, sheet, coatingSheetInputSchema.parse(clash.serverVersion), byName)
    } else if (clash.recordType === 'moulding_shift') {
      const version = clash.serverVersion as { entryDate: string; shift: number; entries: Array<Record<string, unknown>> }
      await saveShift(ctx, version.entryDate, version.shift, version.entries.map((entry) => mouldingEntrySchema.parse(entry)), byName)
    } else throw new PlantError('This record type cannot be switched back here', 409)
  }
  clash.status = 'resolved'
  clash.kept = keep
  clash.resolvedAt = new Date()
  clash.resolvedByName = byName
  clash.resolveReason = reason
  await ctx.em.flush()
  return clash
}
