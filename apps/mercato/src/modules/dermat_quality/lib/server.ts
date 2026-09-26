import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { QcError } from './service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type QcContext = {
  container: Awaited<ReturnType<typeof createRequestContainer>>
  em: EntityManager
  tenantId: string
  organizationId: string
  userId: string | null
  auth?: { sub?: unknown } | null
}

export async function resolveQcContext(req: Request): Promise<QcContext | { error: string; status: number }> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return { error: 'Unauthorized', status: 401 }
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return { error: 'Select an organization first', status: 400 }
  const em = (container.resolve('em') as EntityManager).fork()
  const userId = [auth.sub, auth.userId].find((value): value is string => typeof value === 'string' && UUID_RE.test(value)) ?? null
  return { container, em, tenantId: auth.tenantId, organizationId, userId, auth }
}

export async function currentUserName(ctx: QcContext): Promise<string | null> {
  if (!ctx.userId) return null
  const user = await findOneWithDecryption(ctx.em, User, { id: ctx.userId, deletedAt: null }, undefined, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!user) return null
  const name = typeof user.name === 'string' ? user.name.trim() : ''
  return name || (typeof user.email === 'string' ? user.email : null)
}

export async function productSummaries(ctx: QcContext, ids: string[]): Promise<Map<string, { title: string; code: string | null; kind: string | null }>> {
  const unique = Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
  const result = new Map<string, { title: string; code: string | null; kind: string | null }>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; title: string; kind: string | null; code: string | null }>>(
    `select p.id, p.title, p.custom_fieldset_code as kind,
            (select v.value_text from custom_field_values v where v.record_id = p.id::text and v.field_key = 'item_code' and v.deleted_at is null
              and coalesce(v.value_text, '') <> '' order by v.created_at desc limit 1) as code
       from catalog_products p where p.id = any(?::uuid[]) and p.tenant_id = ? and p.organization_id = ?`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) result.set(row.id, { title: row.title, code: row.code, kind: row.kind })
  return result
}

export function qcErrorResponse(error: unknown) {
  if (error instanceof QcError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  throw error
}

export async function runGuarded<T>(
  ctx: QcContext,
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

export async function canTestQc(ctx: { container: { resolve: (name: string) => unknown }; auth?: { sub?: unknown } | null; userId?: string | null; tenantId: string; organizationId: string }): Promise<boolean> {
  const subject = typeof ctx.auth?.sub === 'string' ? ctx.auth.sub : ctx.userId
  if (!subject) return false
  const rbac = ctx.container.resolve('rbacService') as { userHasAllFeatures: (id: string, features: string[], scope: { tenantId: string; organizationId: string }) => Promise<boolean> }
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  return (await rbac.userHasAllFeatures(subject, ['dermat_quality.chemical'], scope)) || (await rbac.userHasAllFeatures(subject, ['dermat_quality.micro'], scope))
}
