import { RECORD_TYPES } from './timeline'

type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string | null; organizationId: string | null }) => Promise<boolean> }

type AccessContext = { userId?: string | null; tenantId: string; organizationId: string; container: { resolve: (name: string) => unknown } }

export async function recordAccess(ctx: AccessContext, type: string, extra: string[] = []): Promise<{ error: string; status: number } | { granted: Set<string> }> {
  const def = RECORD_TYPES[type]
  if (!def) return { error: 'Unknown record type', status: 400 }
  if (!ctx.userId) return { error: 'Unauthorized', status: 401 }
  const rbac = ctx.container.resolve('rbacService') as RbacLike
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const wanted = Array.from(new Set([def.viewFeature, 'cc_audit.view', ...extra]))
  const checks = await Promise.all(wanted.map((feature) => rbac.userHasAllFeatures(ctx.userId!, [feature], scope)))
  const granted = new Set(wanted.filter((_, index) => checks[index]))
  if (!granted.has(def.viewFeature) && !granted.has('cc_audit.view')) return { error: 'Forbidden', status: 403 }
  return { granted }
}
