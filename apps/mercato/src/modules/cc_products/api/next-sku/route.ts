import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { nextSeriesCode } from '../../../cc_accounts/lib/numberSeries'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.manage'] },
}

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return NextResponse.json({ error: 'Select an organization first' }, { status: 400 })
  const em = container.resolve('em') as EntityManager
  const sku = await nextSeriesCode({ em, tenantId: auth.tenantId, organizationId }, 'SKU')
  return NextResponse.json({ sku })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Products',
  summary: 'Next product SKU',
  methods: {
    GET: { summary: 'The next product SKU from the Product SKU number series', tags: ['Creative Carbon Products'], responses: [{ status: 200, description: 'Next SKU', schema: z.object({ sku: z.string() }) }] },
  },
}

export { GET }
