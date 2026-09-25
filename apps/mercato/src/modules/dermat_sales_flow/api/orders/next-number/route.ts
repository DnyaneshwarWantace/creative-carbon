import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { SalesDocumentNumberGenerator } from '@open-mercato/core/modules/sales/services/salesDocumentNumberGenerator'
import { loadSalesSettings } from '@open-mercato/core/modules/sales/commands/settings'
import { DEFAULT_ORDER_NUMBER_FORMAT } from '@open-mercato/core/modules/sales/lib/documentNumberTokens'
import type { EntityManager } from '@mikro-orm/postgresql'

const logger = createLogger('dermat_sales_flow')

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['sales.orders.view'] },
}

export async function GET(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    const { translate } = await resolveTranslations()
    if (!auth || !auth.tenantId) {
      throw new CrudHttpError(401, { error: translate('dermat_sales_flow.errors.unauthorized', 'Unauthorized') })
    }
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = scope?.selectedId ?? auth.orgId ?? null
    if (!organizationId) {
      throw new CrudHttpError(400, { error: translate('dermat_sales_flow.errors.no_organization', 'No organization selected') })
    }
    const tenantId = auth.tenantId

    const em = container.resolve<EntityManager>('em')
    const generator = container.resolve<SalesDocumentNumberGenerator>('salesDocumentNumberGenerator')
    const [settings, sequences] = await Promise.all([
      loadSalesSettings(em, { tenantId, organizationId }),
      generator.peekSequences({ organizationId, tenantId }),
    ])
    const format = settings?.orderNumberFormat?.trim() || DEFAULT_ORDER_NUMBER_FORMAT
    const previewNumber = generator.formatNumber(format, {
      kind: 'order',
      sequence: sequences.order,
      date: new Date(),
    })

    return NextResponse.json({
      nextOrderNumber: previewNumber,
      orderNumberFormat: format,
    })
  } catch (err) {
    if (isCrudHttpError(err)) {
      return NextResponse.json(err.body, { status: err.status })
    }
    logger.error('dermat_sales_flow.orders.next_number failed', { err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const resultSchema = z.object({
  nextOrderNumber: z.string(),
  orderNumberFormat: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatSalesFlow',
  summary: 'Preview the next sales order number',
  methods: {
    GET: {
      summary: 'Next order number preview',
      description: 'Read-only preview of the order number that will be assigned to the next created order, without claiming/incrementing the sequence. Used to display the auto-generated number in the order-create wizard before save.',
      responses: [
        { status: 200, description: 'Next order number preview', schema: resultSchema },
      ],
    },
  },
}
