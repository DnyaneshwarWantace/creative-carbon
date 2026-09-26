import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { runListGuarded } from '../../lib/server'
import { listQuerySchema, listSaveSchema } from '../../data/validators'
import { ListError, cleanOptions, listDef, listVersion, listViews, resetList, saveList } from '../../lib/service'

export const metadata = {
  GET: { requireAuth: true },
  PUT: { requireAuth: true, requireFeatures: ['dermat_lists.manage'] },
}

function errorResponse(error: unknown) {
  if (error instanceof ListError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json({ items: await listViews(ctx, parsed.data.key) })
  } catch (error) {
    return errorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = listSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the list key and its choices' }, { status: 400 })
  const def = listDef(parsed.data.key)
  if (!def) return NextResponse.json({ error: 'Unknown list' }, { status: 404 })
  try {
    const [current] = await listViews(ctx, def.key)
    const version = listVersion(current)
    if (version) enforceCommandOptimisticLock({ resourceKind: 'dermat_lists.list', resourceId: def.key, current: version, request: req })
    const options = 'options' in parsed.data ? cleanOptions(def, parsed.data.options) : null
    if (!options && def.fixed) throw new ListError(`${def.label} is fixed`, 409)
    const userName = await currentUserName(ctx)
    const result = await runListGuarded(ctx, req, def.key, parsed.data as Record<string, unknown>, async () => {
      if (options) await saveList(ctx, def, options, userName)
      else await resetList(ctx, def)
      const [saved] = await listViews(ctx, def.key)
      return saved
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

const optionSchema = z.object({ value: z.string(), active: z.boolean(), locked: z.boolean() })
const listSchema = z.object({ key: z.string(), label: z.string(), department: z.string(), usedIn: z.string(), fixed: z.string().nullable(), customised: z.boolean(), options: z.array(optionSchema), updatedAt: z.string().nullable(), updatedByName: z.string().nullable() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Lists',
  summary: 'Dropdown lists',
  methods: {
    GET: { summary: 'Every managed dropdown with its choices (or one list with ?key=)', tags: ['Dermat Lists'], query: listQuerySchema, responses: [{ status: 200, description: 'Lists', schema: z.object({ items: z.array(listSchema) }) }] },
    PUT: { summary: 'Replace the choices of one list, or reset it to the defaults', tags: ['Dermat Lists'], requestBody: { schema: listSaveSchema }, responses: [{ status: 200, description: 'Saved list', schema: listSchema }] },
  },
}

export { GET, PUT }
