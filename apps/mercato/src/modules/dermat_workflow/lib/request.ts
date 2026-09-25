import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  bridgeLegacyGuard,
  runMutationGuards,
  type MutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { WorkflowScope } from './engine'

const logger = createLogger('dermat_workflow')

export type WorkflowRequestContext = {
  ctx: CommandRuntimeContext
  scope: WorkflowScope
}

export async function resolveWorkflowRequest(req: Request): Promise<WorkflowRequestContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.tenantId) throw new CrudHttpError(401, { error: 'Unauthorized' })
  const organizationScope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = organizationScope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'No organization selected' })
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: organizationId,
    organizationIds: organizationScope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
  return { ctx, scope: { organizationId, tenantId: auth.tenantId } }
}

export async function hasFeatures(ctx: CommandRuntimeContext, features: string[]): Promise<boolean> {
  const rbac = ctx.container.resolve('rbacService') as RbacService | null
  const userId = ctx.auth?.sub
  if (!rbac || !userId) return false
  return rbac.userHasAllFeatures(userId, features, {
    tenantId: ctx.auth?.tenantId ?? null,
    organizationId: ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null,
  })
}

function resolveUserFeatures(auth: unknown): string[] {
  const features = (auth as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  return features.filter((value): value is string => typeof value === 'string')
}

type GuardTarget = { resourceKind: string; resourceId: string; operation: 'create' | 'update' | 'delete' }

export async function withMutationGuards<T>(
  req: Request,
  ctx: CommandRuntimeContext,
  target: GuardTarget,
  run: () => Promise<T>,
): Promise<T | NextResponse> {
  const guardInput = {
    tenantId: ctx.auth?.tenantId ?? '',
    organizationId: ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null,
    userId: ctx.auth?.sub ?? '',
    resourceKind: target.resourceKind,
    resourceId: target.resourceId,
    operation: target.operation,
    requestMethod: req.method,
    requestHeaders: req.headers,
  }
  const legacyGuard = bridgeLegacyGuard(ctx.container)
  let callbacks: Array<{ guard: MutationGuard; metadata: Record<string, unknown> | null }> = []
  if (legacyGuard) {
    const result = await runMutationGuards([legacyGuard], guardInput, { userFeatures: resolveUserFeatures(ctx.auth) })
    if (!result.ok) {
      return NextResponse.json(result.errorBody ?? { error: 'Operation blocked by guard' }, { status: result.errorStatus ?? 422 })
    }
    callbacks = result.afterSuccessCallbacks
  }
  const output = await run()
  for (const callback of callbacks) {
    if (!callback.guard.afterSuccess) continue
    try {
      await callback.guard.afterSuccess({ ...guardInput, metadata: callback.metadata ?? null })
    } catch (err) {
      logger.warn('dermat_workflow guard afterSuccess failed', { err })
    }
  }
  return output
}

export function workflowErrorResponse(err: unknown, label: string): NextResponse {
  if (isCrudHttpError(err)) {
    const body = { ...(err.body as Record<string, unknown>) }
    if (typeof body.error === 'string') body.error = body.error.replace(/^\[internal\]\s*/, '')
    return NextResponse.json(body, { status: err.status })
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
  }
  logger.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`, {
    err,
    stack: err instanceof Error ? err.stack : undefined,
  })
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
