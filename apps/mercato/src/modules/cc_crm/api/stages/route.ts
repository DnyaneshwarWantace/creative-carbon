import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { STAGE_TONES, createStage, deleteStage, listStages, reorderStages, stageView, updateStage } from '../../lib/stages'
import { crmErrorResponse } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
  DELETE: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
}

const questionSchema = z.object({
  key: z.string().trim().max(60).optional().default(''),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'yesno']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().max(80)).max(30).optional(),
  hint: z.string().trim().max(200).nullable().optional(),
})

const toneSchema = z.enum(STAGE_TONES)
const createSchema = z.object({ label: z.string().trim().min(1).max(60), description: z.string().trim().max(300).nullable().optional(), tone: toneSchema.optional(), questions: z.array(questionSchema).max(20).optional(), afterKey: z.string().trim().max(60).nullable().optional() })
const updateSchema = z.union([
  z.object({ order: z.array(z.string().uuid()).min(1).max(60) }),
  z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(60).optional(), description: z.string().trim().max(300).nullable().optional(), tone: toneSchema.optional(), questions: z.array(questionSchema).max(20).optional(), isActive: z.boolean().optional() }),
])

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const all = new URL(req.url).searchParams.get('all') === '1'
  try {
    return NextResponse.json({ items: await listStages(ctx, { includeInactive: all }) })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Give the stage a name' }, { status: 400 })
  try {
    return NextResponse.json(stageView(await createStage(ctx, { ...parsed.data, questions: parsed.data.questions?.map((question) => ({ ...question, key: question.key ?? '' })) })), { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the stage' }, { status: 400 })
  try {
    if ('order' in parsed.data) {
      await reorderStages(ctx, parsed.data.order)
      return NextResponse.json({ items: await listStages(ctx, { includeInactive: true }) })
    }
    const { id, ...rest } = parsed.data
    return NextResponse.json(stageView(await updateStage(ctx, id, { ...rest, questions: rest.questions?.map((question) => ({ ...question, key: question.key ?? '' })) })))
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Say which stage' }, { status: 400 })
  try {
    await deleteStage(ctx, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Pipeline stages: the board columns, with the questions asked when an enquiry moves into a stage',
  methods: {
    GET: { summary: 'Stages in board order (?all=1 includes switched-off stages)', tags: ['Creative Carbon CRM'], responses: [{ status: 200, description: 'Stages', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Add a stage (open kind, placed after a given stage)', tags: ['Creative Carbon CRM'], requestBody: { schema: createSchema }, responses: [{ status: 201, description: 'Stage', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Rename / recolour / change questions / switch on-off, or reorder (order: ids)', tags: ['Creative Carbon CRM'], requestBody: { schema: updateSchema }, responses: [{ status: 200, description: 'Stage or stages', schema: z.object({}).passthrough() }] },
    DELETE: { summary: 'Remove a custom stage that has no enquiries', tags: ['Creative Carbon CRM'], responses: [{ status: 200, description: 'Removed', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { GET, POST, PUT, DELETE }
