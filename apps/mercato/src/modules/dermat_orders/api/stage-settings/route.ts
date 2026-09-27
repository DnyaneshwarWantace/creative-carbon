import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { DermatStageSetting } from '../../data/entities'
import { stageSettingSchema } from '../../data/validators'
import { currentUserName, resolveOrderContext, type OrderContext } from '../../lib/server'
import { overrideOf } from '../../lib/stageSettings'
import { DEFAULT_REOPEN_HOURS, EXTRA_FIELD_TYPES, LOCKED_STEPS, STAGES, STAGE_DAY_LIMIT, STAGE_DOCUMENTS } from '../../lib/stages'

export const metadata = {
  GET: { requireAuth: true },
  PUT: { requireAuth: true, requireFeatures: ['dermat_orders.settings'] },
  DELETE: { requireAuth: true, requireFeatures: ['dermat_orders.settings'] },
}

async function payload(ctx: OrderContext) {
  const rows = await ctx.em.find(DermatStageSetting, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  return {
    fieldTypes: EXTRA_FIELD_TYPES,
    overrides: rows.map((row) => ({ ...overrideOf(row), updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedByName ?? null })),
    stages: STAGES.filter((stage) => stage.key !== 'order').map((stage) => ({
      key: stage.key,
      label: stage.label,
      department: stage.department,
      hint: stage.hint,
      dayLimit: STAGE_DAY_LIMIT[stage.key] ?? null,
      reopenHours: DEFAULT_REOPEN_HOURS,
      steps: stage.steps.map((step) => ({ ...step, locked: (LOCKED_STEPS[stage.key] ?? []).includes(step.key) })),
      fields: stage.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, required: Boolean(field.required) })),
      documents: (STAGE_DOCUMENTS[stage.key] ?? []).map((doc) => ({ key: doc.key, label: doc.label, required: doc.required ?? null })),
    })),
  }
}

async function guarded(ctx: OrderContext, req: Request, stageKey: string, body: Record<string, unknown>, run: () => Promise<Response>) {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'dermat_orders.stage_setting', resourceId: stageKey, operation: 'custom', mutationPayload: body },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json(await payload(ctx))
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stageSettingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the stage settings' }, { status: 400 })
  const input = parsed.data
  const base = STAGES.find((stage) => stage.key === input.stageKey && stage.key !== 'order')
  if (!base) return NextResponse.json({ error: 'Unknown stage' }, { status: 404 })
  const locked = LOCKED_STEPS[base.key] ?? []
  const lockedHidden = input.hiddenSteps.filter((key) => locked.includes(key))
  if (lockedHidden.length) return NextResponse.json({ error: `${base.steps.filter((step) => lockedHidden.includes(step.key)).map((step) => step.label).join(', ')} cannot be hidden: the system acts on it` }, { status: 400 })
  if (input.hiddenSteps.some((key) => !base.steps.some((step) => step.key === key))) return NextResponse.json({ error: 'A hidden step is not on this stage' }, { status: 400 })
  if (input.requiredFields.some((key) => !base.fields.some((field) => field.key === key))) return NextResponse.json({ error: 'A required field is not on this stage' }, { status: 400 })
  const extraKeys = input.extraFields.map((field) => field.key)
  if (new Set(extraKeys).size !== extraKeys.length) return NextResponse.json({ error: 'Two extra fields have the same name' }, { status: 400 })
  if (input.extraFields.some((field) => field.type === 'select' && !(field.options ?? []).length)) return NextResponse.json({ error: 'A dropdown field needs its choices' }, { status: 400 })
  const docs = STAGE_DOCUMENTS[base.key] ?? []
  if (Object.keys(input.documents).some((key) => !docs.some((doc) => doc.key === key && doc.required !== 'eway'))) return NextResponse.json({ error: 'A document rule does not match this stage' }, { status: 400 })
  try {
    const existing = await ctx.em.findOne(DermatStageSetting, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, stageKey: base.key })
    if (existing) enforceCommandOptimisticLock({ resourceKind: 'dermat_orders.stage_setting', resourceId: existing.id, current: existing.updatedAt, request: req })
    return await guarded(ctx, req, base.key, input as unknown as Record<string, unknown>, async () => {
      const row = existing ?? ctx.em.create(DermatStageSetting, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, stageKey: base.key })
      row.label = input.label?.trim() && input.label.trim() !== base.label ? input.label.trim() : null
      row.dayLimit = input.dayLimit && input.dayLimit !== STAGE_DAY_LIMIT[base.key] ? input.dayLimit : null
      row.reopenHours = input.reopenHours != null && input.reopenHours !== DEFAULT_REOPEN_HOURS ? input.reopenHours : null
      row.hiddenSteps = input.hiddenSteps
      row.requiredFields = input.requiredFields.filter((key) => !base.fields.find((field) => field.key === key)?.required)
      row.extraFields = input.extraFields.map((field) => ({ key: field.key, label: field.label.trim(), type: field.type, ...(field.type === 'select' ? { options: field.options ?? [] } : {}), required: Boolean(field.required) }))
      row.documents = input.documents
      row.extraDocuments = input.extraDocuments
      row.updatedByName = await currentUserName(ctx)
      row.updatedAt = new Date()
      ctx.em.persist(row)
      await ctx.em.flush()
      return NextResponse.json(await payload(ctx))
    })
  } catch (error) {
    if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
    throw error
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const stageKey = new URL(req.url).searchParams.get('stageKey') ?? ''
  try {
    const existing = await ctx.em.findOne(DermatStageSetting, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, stageKey })
    if (!existing) return NextResponse.json(await payload(ctx))
    enforceCommandOptimisticLock({ resourceKind: 'dermat_orders.stage_setting', resourceId: existing.id, current: existing.updatedAt, request: req })
    return await guarded(ctx, req, stageKey, { stageKey, reset: true }, async () => {
      ctx.em.remove(existing)
      await ctx.em.flush()
      return NextResponse.json(await payload(ctx))
    })
  } catch (error) {
    if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
    throw error
  }
}

const settingsResponse = z.object({ stages: z.array(z.object({ key: z.string() }).passthrough()), overrides: z.array(z.object({ stageKey: z.string() }).passthrough()) }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Workflow stage settings: names, day limits, hidden steps, extra fields and required documents',
  methods: {
    GET: { summary: 'Base stages with their saved changes', tags: ['Dermat Orders'], responses: [{ status: 200, description: 'Settings', schema: settingsResponse }] },
    PUT: { summary: 'Save the changes for one stage', tags: ['Dermat Orders'], requestBody: { schema: stageSettingSchema }, responses: [{ status: 200, description: 'Saved', schema: settingsResponse }] },
    DELETE: { summary: 'Put one stage back to the default (?stageKey=)', tags: ['Dermat Orders'], responses: [{ status: 200, description: 'Reset', schema: settingsResponse }] },
  },
}

export { GET, PUT, DELETE }
