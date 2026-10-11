import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { UploadBatch } from '../../../data/entities'
import { undoAvailability, undoBlockers, undoFeatures, undoUpload } from '../../../lib/upload/undo'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue, requireReasonFor } from '../../../../cc_audit/lib/reason'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
}

const previewSchema = z.object({ id: z.string().uuid() })
const undoSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function findBatch(ctx: { em: import('@mikro-orm/postgresql').EntityManager; tenantId: string; organizationId: string }, id: string) {
  const batch = await ctx.em.findOne(UploadBatch, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!batch) throw new PlantError('Upload not found', 404)
  return batch
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = previewSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which upload' }, { status: 400 })
  try {
    const batch = await findBatch(ctx, parsed.data.id)
    const unavailable = undoAvailability(batch)
    const features = undoFeatures(batch)
    return NextResponse.json({
      unavailable,
      allowed: await hasFeatures(ctx, features),
      features,
      blockedBy: unavailable ? [] : await undoBlockers(ctx, batch),
      undo: (batch.records ?? []).filter((record) => record.created && !record.undone).map((record) => record.label),
      kept: (batch.records ?? []).filter((record) => !record.created).map((record) => record.label),
    })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = undoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which upload' }, { status: 400 })
  try {
    const batch = await findBatch(ctx, parsed.data.id)
    if (!(await hasFeatures(ctx, undoFeatures(batch)))) return NextResponse.json({ error: 'Undoing this upload needs the same rights as reopening each record it made' }, { status: 403 })
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.upload', resourceId: batch.id, current: batch.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const reason = parsed.data.reason ?? ''
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.upload', resourceId: batch.id, operation: 'custom', payload: parsed.data }, () => undoUpload(ctx, batch, reason, byName))
    if (result instanceof Response) return result
    const undone = (batch.records ?? []).filter((record) => record.undone)
    await logCorrection(ctx, { recordType: 'upload', recordId: batch.id, action: 'undone', summary: `Upload undone: ${result.undone} record${result.undone === 1 ? '' : 's'} reversed${result.kept ? `, ${result.kept} changed records left as they are` : ''}`, reason, links: undone.slice(0, 50).map((record) => ({ type: record.type === 'master' ? (record.masterType === 'moulds' ? 'die' : 'master') : record.type, id: record.id, label: record.label })) })
    return NextResponse.json({ ok: true, ...result, updatedAt: batch.updatedAt.toISOString() })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Upload',
  summary: 'Undo a whole upload within 7 days when nothing it made is used yet',
  methods: {
    GET: { summary: 'What undo would reverse and what blocks it', tags: ['Creative Carbon Upload'], query: previewSchema, responses: [{ status: 200, description: 'Preview', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Undo the upload', tags: ['Creative Carbon Upload'], requestBody: { schema: undoSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }).passthrough() }], errors: [{ status: 409, description: 'Too old, already undone, or a record is used' }] },
  },
}

export { GET, POST }
