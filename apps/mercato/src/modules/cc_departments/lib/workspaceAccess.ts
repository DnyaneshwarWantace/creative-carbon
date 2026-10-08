import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CRM_FEATURE, ERP_FEATURE, type WorkspaceAccess } from './workspace'

type AuthLike = { sub?: string | null; tenantId?: string | null; orgId?: string | null } | null | undefined
type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string | null; organizationId: string | null }) => Promise<boolean> }

export async function resolveWorkspaceAccess(auth: AuthLike): Promise<WorkspaceAccess> {
  if (!auth?.sub) return { crm: false, erp: false }
  const container = await createRequestContainer()
  const rbac = container.resolve('rbacService') as RbacLike
  const scope = { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null }
  const [crm, erp] = await Promise.all([rbac.userHasAllFeatures(auth.sub, [CRM_FEATURE], scope), rbac.userHasAllFeatures(auth.sub, [ERP_FEATURE], scope)])
  return { crm, erp }
}
