import { NextResponse } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OrderContext } from '../../cc_orders/lib/server'

export class PlantError extends Error {
  status: number
  details?: Record<string, unknown>
  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function plantErrorResponse(error: unknown) {
  if (error instanceof PlantError) return NextResponse.json({ error: error.message, ...(error.details ?? {}) }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export async function runPlantGuarded<T>(
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
