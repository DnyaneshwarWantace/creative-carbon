import { NextResponse } from 'next/server'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OrderContext } from '../../dermat_orders/lib/server'
import { PlanningError } from './service'

export function planningErrorResponse(error: unknown) {
  if (error instanceof PlanningError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export async function runGuarded<T>(
  ctx: OrderContext,
  req: Request,
  input: { resourceKind: string; resourceId: string; operation: 'create' | 'update' | 'delete' | 'custom'; payload: Record<string, unknown> },
  run: () => Promise<T>,
): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: input.resourceKind, resourceId: input.resourceId, operation: input.operation, mutationPayload: input.payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
