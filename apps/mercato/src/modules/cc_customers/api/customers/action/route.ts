import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { hasFeatures } from '../../../../cc_orders/lib/server'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'
import { CustomerActionError, mergeCustomers, setCustomerActive } from '../../../lib/customerHistory'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.companies.manage'] },
}

const actionSchema = z
  .object({ id: z.string().uuid(), action: z.enum(['deactivate', 'activate', 'merge']), mergeId: z.string().uuid().optional(), reason: z.string().trim().max(500).optional() })
  .superRefine(requireReasonFor(['deactivate', 'activate', 'merge']))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  const input = parsed.data
  if (input.action === 'merge' && !(await hasFeatures(ctx, ['cc_crm.merge']))) return NextResponse.json({ error: 'Merging customers needs the merge right' }, { status: 403 })
  if (input.action === 'merge' && !input.mergeId) return NextResponse.json({ error: 'Pick the duplicate customer to merge in' }, { status: 400 })
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'customers.company', resourceId: input.id, operation: 'update', mutationPayload: input },
  })
  if (!guard.ok) return guard.response
  try {
    const reason = input.reason!.trim()
    const result = input.action === 'merge' ? await mergeCustomers(ctx, input.id, input.mergeId!, reason) : (await setCustomerActive(ctx, input.id, input.action === 'activate', reason), { moved: [] as string[] })
    await guard.runAfterSuccess()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof CustomerActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Customers',
  summary: 'Set a customer inactive / active, or merge a duplicate into it',
  methods: {
    POST: {
      summary: 'deactivate (blocked with open orders), activate, merge (mergeId is the duplicate; its enquiries, quotations, orders, proformas, invoices, lab reports and dies move here). Reason needed.',
      tags: ['Creative Carbon Customers'],
      requestBody: { schema: actionSchema },
      responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean(), moved: z.array(z.string()) }) }],
      errors: [{ status: 409, description: 'Open orders, or both have invoices in the same month' }],
    },
  },
}

export { POST }
