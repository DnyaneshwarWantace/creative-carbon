import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OrderContext } from '../../dermat_orders/lib/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type StoreContext = OrderContext & {
  organizationScope: Awaited<ReturnType<typeof resolveOrganizationScopeForRequest>>
  request: Request
}

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export async function resolveStoreContext(req: Request): Promise<StoreContext | { error: string; status: number }> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return { error: 'Unauthorized', status: 401 }
  const container = await createRequestContainer()
  const organizationScope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = organizationScope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return { error: 'Select an organization first', status: 400 }
  const em = (container.resolve('em') as EntityManager).fork()
  const userId = [auth.sub, auth.userId].find((value): value is string => typeof value === 'string' && UUID_RE.test(value)) ?? null
  return { container, em, tenantId: auth.tenantId, organizationId, userId, auth, organizationScope, request: req }
}

export function performerId(ctx: StoreContext): string {
  if (ctx.userId) return ctx.userId
  const sub = typeof ctx.auth.sub === 'string' ? ctx.auth.sub : ''
  const candidate = sub.includes(':') ? sub.slice(sub.indexOf(':') + 1) : sub
  return UUID_RE.test(candidate) ? candidate : ctx.organizationId
}

export async function runCommand<T>(ctx: StoreContext, commandId: string, input: Record<string, unknown>): Promise<T> {
  const commandCtx: CommandRuntimeContext = {
    container: ctx.container,
    auth: ctx.auth,
    organizationScope: ctx.organizationScope,
    selectedOrganizationId: ctx.organizationId,
    organizationIds: ctx.organizationScope?.filterIds ?? [ctx.organizationId],
    request: ctx.request,
  }
  const commandBus = ctx.container.resolve('commandBus') as CommandBus
  const { result } = await commandBus.execute<Record<string, unknown>, T>(commandId, {
    input: { ...input, tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    ctx: commandCtx,
  })
  return result
}

export function storeErrorResponse(error: unknown) {
  if (error instanceof StoreError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) {
    const body = error.body as { error?: string } | undefined
    if (body?.error === 'insufficient_stock') return NextResponse.json({ error: 'Not enough free stock in that batch' }, { status: 409 })
    return NextResponse.json(error.body, { status: error.status })
  }
  if (error instanceof ZodError) return NextResponse.json({ error: `Stock change rejected: ${error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}` }, { status: 400 })
  throw error
}

export async function runGuarded<T>(
  ctx: StoreContext,
  req: Request,
  input: { resourceId: string; operation: 'create' | 'update' | 'delete' | 'custom'; payload: Record<string, unknown>; resourceKind?: string },
  run: () => Promise<T>,
): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: input.resourceKind ?? 'dermat_store.request', resourceId: input.resourceId, operation: input.operation, mutationPayload: input.payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
