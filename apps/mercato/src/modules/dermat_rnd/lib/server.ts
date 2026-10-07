import { NextResponse } from 'next/server'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OrderContext } from '../../dermat_orders/lib/server'
import { BomError } from '../../dermat_boms/lib/service'
import { RdError } from './service'

export function rdErrorResponse(error: unknown) {
  if (error instanceof RdError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof BomError) return NextResponse.json({ error: error.message, ...(error.details ?? {}) }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export async function runRdGuarded<T>(ctx: OrderContext, req: Request, resourceId: string, operation: 'create' | 'update', payload: Record<string, unknown>, run: () => Promise<T>, resourceKind = 'dermat_rnd.request'): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind, resourceId, operation, mutationPayload: payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
