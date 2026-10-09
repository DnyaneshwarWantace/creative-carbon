import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveStoreContext, type StoreContext } from '../../../cc_store/lib/server'
import { CustomerSaveError, customerSaveSchema, saveCustomer, validateCustomer } from '../../lib/saveCustomer'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.companies.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.companies.manage'] },
}

const checkSchema = customerSaveSchema.extend({ checkOnly: z.literal(true) })

function errorResponse(error: unknown) {
  if (error instanceof CustomerSaveError) return NextResponse.json({ error: error.message, fields: error.fields }, { status: error.status })
  if (error instanceof CrudHttpError) {
    const body = (error.body ?? {}) as { error?: string; fieldErrors?: Record<string, string> }
    return NextResponse.json({ error: body.error ?? 'Could not save the customer', fields: body.fieldErrors ?? {} }, { status: error.status })
  }
  throw error
}

async function guarded(ctx: StoreContext, req: Request, resourceId: string, operation: 'create' | 'update', payload: Record<string, unknown>, run: () => Promise<Response>) {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'customers.company', resourceId, operation, mutationPayload: payload },
  })
  if (!guard.ok) return guard.response
  const response = await run()
  await guard.runAfterSuccess()
  return response
}

async function currentVersion(ctx: StoreContext, entityId: string): Promise<Date | null> {
  const [row] = await ctx.em.getConnection().execute<Array<{ updated_at: Date }>>('select updated_at from customer_entities where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null', [entityId, ctx.tenantId, ctx.organizationId])
  return row ? new Date(row.updated_at) : null
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const body = await req.json().catch(() => null)
  const check = checkSchema.safeParse(body)
  if (check.success) {
    try {
      await validateCustomer(ctx, check.data)
      return NextResponse.json({ ok: true })
    } catch (error) {
      return errorResponse(error)
    }
  }
  const parsed = customerSaveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Some fields need fixing', fields: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])) }, { status: 400 })
  if (parsed.data.id) return NextResponse.json({ error: 'Use PUT to change a customer' }, { status: 400 })
  try {
    return await guarded(ctx, req, 'new', 'create', parsed.data, async () => NextResponse.json(await saveCustomer(ctx, parsed.data), { status: 201 }))
  } catch (error) {
    return errorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = customerSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Some fields need fixing', fields: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])) }, { status: 400 })
  if (!parsed.data.id) return NextResponse.json({ error: 'Give the customer id' }, { status: 400 })
  try {
    const version = await currentVersion(ctx, parsed.data.id)
    if (!version) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    enforceCommandOptimisticLock({ resourceKind: 'customers.company', resourceId: parsed.data.id, current: version, request: req })
    return await guarded(ctx, req, parsed.data.id, 'update', parsed.data, async () => NextResponse.json(await saveCustomer(ctx, parsed.data)))
  } catch (error) {
    return errorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Customers',
  summary: 'Save a customer in one go: company, GST details, billing / shipping address and contacts, all checked first',
  methods: {
    POST: { summary: 'Create a customer (or { checkOnly: true } to validate without saving)', tags: ['Creative Carbon Customers'], requestBody: { schema: customerSaveSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), customerNo: z.string().nullable() }) }], errors: [{ status: 400, description: 'Field errors' }, { status: 409, description: 'Same GSTIN or name exists' }] },
    PUT: { summary: 'Change a customer', tags: ['Creative Carbon Customers'], requestBody: { schema: customerSaveSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ id: z.string(), customerNo: z.string().nullable() }) }], errors: [{ status: 409, description: 'Changed by someone else, or duplicate' }] },
  },
}

export { POST, PUT }
