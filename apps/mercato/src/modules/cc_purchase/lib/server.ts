import { NextResponse } from 'next/server'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OrderContext } from '../../cc_orders/lib/server'
import { PurchaseError } from './service'

export function purchaseErrorResponse(error: unknown) {
  if (error instanceof PurchaseError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) {
    const body = error.body as { error?: string } | undefined
    if (body?.error === 'insufficient_stock') return NextResponse.json({ error: 'That batch no longer has that much in the store' }, { status: 409 })
    return NextResponse.json(error.body, { status: error.status })
  }
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
