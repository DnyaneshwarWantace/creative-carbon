import type { PageRouteMiddleware } from '@open-mercato/shared/modules/middleware/page'

type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string | null; organizationId: string | null }) => Promise<boolean> }

export const middleware: PageRouteMiddleware[] = [
  {
    id: 'cc_dashboard.home',
    mode: 'backend',
    target: '/backend',
    run: async ({ auth, ensureContainer }) => {
      if (auth?.sub) {
        const container = await ensureContainer()
        const rbac = container.resolve('rbacService') as RbacLike
        const owner = await rbac.userHasAllFeatures(auth.sub, ['cc_production.owner.view'], { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null })
        if (owner) return { action: 'redirect', location: '/backend/owner' }
      }
      return { action: 'redirect', location: '/backend/overview' }
    },
  },
]

export default middleware
