import { NextResponse } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OrderContext } from '../../cc_orders/lib/server'
import { AccountsError } from './service'

export function accountsErrorResponse(error: unknown) {
  if (error instanceof AccountsError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export async function runGuarded<T>(ctx: OrderContext, req: Request, resourceId: string, payload: Record<string, unknown>, run: () => Promise<T>): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'cc_accounts.payment', resourceId, operation: 'custom', mutationPayload: payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
