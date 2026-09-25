import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { QcRule } from '../../data/entities'
import { ruleInputSchema, ruleUpdateSchema } from '../../data/validators'
import { QcError, ensureDefaultRules, nextCode } from '../../lib/service'
import { productSummaries, qcErrorResponse, resolveQcContext, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_quality.rules'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_quality.rules'] },
  DELETE: { requireAuth: true, requireFeatures: ['dermat_quality.rules'] },
}

const RESOURCE = 'dermat_quality.rule'

function view(rule: QcRule, product?: { title: string; code: string | null } | null) {
  return {
    id: rule.id,
    code: rule.code,
    title: rule.title,
    operation: rule.operation,
    productId: rule.productId ?? null,
    productTitle: product?.title ?? null,
    productCode: product?.code ?? null,
    requiresChemical: rule.requiresChemical,
    requiresMicro: rule.requiresMicro,
    isActive: rule.isActive,
    parameters: rule.parameters ?? [],
    notes: rule.notes ?? null,
    updatedAt: rule.updatedAt.toISOString(),
  }
}

async function GET(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  await ensureDefaultRules(ctx)
  const id = new URL(req.url).searchParams.get('id')
  const where = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, ...(id ? { id } : {}) }
  const rules = await ctx.em.find(QcRule, where, { orderBy: { operation: 'asc', productId: 'asc', code: 'asc' } })
  const products = await productSummaries(
    ctx,
    rules.map((rule) => rule.productId ?? '').filter(Boolean),
  )
  const items = rules.map((rule) => view(rule, rule.productId ? products.get(rule.productId) : null))
  if (id) return items[0] ? NextResponse.json(items[0]) : NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ items })
}

async function POST(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ruleInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid QC rule', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    if (!input.productId) throw new QcError('Pick the product. Each operation already has one default rule; edit that one to change the default.')
    const existing = await ctx.em.findOne(QcRule, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, operation: input.operation, productId: input.productId, deletedAt: null })
    if (existing) throw new QcError('This product already has a rule for this operation', 409)
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: input.productId, operation: 'create', payload: input }, async () => {
      const rule = ctx.em.create(QcRule, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        code: await nextCode(ctx, 'dermat_quality_rules', 'QR', 3),
        title: input.title,
        operation: input.operation,
        productId: input.productId ?? null,
        requiresChemical: input.requiresChemical,
        requiresMicro: input.requiresMicro,
        isActive: input.isActive,
        parameters: input.parameters,
        notes: input.notes ?? null,
      })
      ctx.em.persist(rule)
      await ctx.em.flush()
      return NextResponse.json({ id: rule.id, code: rule.code }, { status: 201 })
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ruleUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid QC rule', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    const rule = await ctx.em.findOne(QcRule, { id: input.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!rule) throw new QcError('Rule not found', 404)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: rule.id, current: rule.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: rule.id, operation: 'update', payload: input }, async () => {
      rule.title = input.title
      rule.requiresChemical = input.requiresChemical
      rule.requiresMicro = input.requiresMicro
      rule.isActive = input.isActive
      rule.parameters = input.parameters
      rule.notes = input.notes ?? null
      rule.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get('id'))
  if (!id.success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const rule = await ctx.em.findOne(QcRule, { id: id.data, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!rule) throw new QcError('Rule not found', 404)
    if (!rule.productId) throw new QcError('The default rule of an operation cannot be deleted. Switch it off instead.', 409)
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: rule.id, operation: 'delete', payload: { id: rule.id } }, async () => {
      rule.deletedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat QC',
  summary: 'QC rules',
  methods: {
    GET: { summary: 'List QC rules (defaults are created on first use), or one by id', tags: ['Dermat QC'], responses: [{ status: 200, description: 'Rules', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Create a product-specific QC rule', tags: ['Dermat QC'], requestBody: { schema: ruleInputSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), code: z.string() }) }] },
    PUT: { summary: 'Update a QC rule', tags: ['Dermat QC'], requestBody: { schema: ruleUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }) }] },
    DELETE: { summary: 'Delete a product-specific QC rule', tags: ['Dermat QC'], responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { GET, POST, PUT, DELETE }
