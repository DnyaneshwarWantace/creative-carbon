import { NextResponse } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { BomHeader } from '../data/entities'
import { BomError } from './service'
import type { BomRequestContext } from './server'

export const RESOURCE_KIND = 'dermat_boms.bom'

export function bomErrorResponse(error: unknown) {
  if (error instanceof BomError) return NextResponse.json({ error: error.message, ...(error.details ?? {}) }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export function enforceBomLock(bom: BomHeader, req: Request): void {
  enforceCommandOptimisticLock({ resourceKind: RESOURCE_KIND, resourceId: bom.id, current: bom.updatedAt, request: req })
}

export async function runGuarded<T>(
  ctx: BomRequestContext,
  req: Request,
  input: { resourceId: string; operation: 'create' | 'update' | 'delete' | 'custom'; payload: Record<string, unknown> },
  run: () => Promise<T>,
): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: RESOURCE_KIND, resourceId: input.resourceId, operation: input.operation, mutationPayload: input.payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
