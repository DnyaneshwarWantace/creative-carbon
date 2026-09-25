import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { Dictionary, DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { EntityManager } from '@mikro-orm/postgresql'

const logger = createLogger('dermat_sales_flow')

const ALLOWED_KEYS = new Set(['category', 'packaging_type'])

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['sales.orders.view'] },
}

export async function GET(
  req: Request,
  ctx: { params?: { key?: string } },
): Promise<Response> {
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

    const keyParam = (ctx.params?.key ?? '').toLowerCase().trim()
    if (!ALLOWED_KEYS.has(keyParam)) {
      throw new CrudHttpError(400, { error: translate('dermat_sales_flow.errors.invalid_dictionary_key', 'Unknown dictionary key.') })
    }

    const em = container.resolve<EntityManager>('em')
    const dictionary = await em.findOne(Dictionary, {
      tenantId,
      organizationId,
      key: keyParam,
      deletedAt: null,
      isActive: true,
    })
    if (!dictionary) {
      return NextResponse.json({ id: null, entries: [] })
    }
    const entries = await em.find(
      DictionaryEntry,
      {
        dictionary,
        organizationId: dictionary.organizationId,
        tenantId: dictionary.tenantId,
      },
      { orderBy: { position: 'asc', label: 'asc' } },
    )
    return NextResponse.json({
      id: dictionary.id,
      entries: entries.map((entry) => ({
        id: entry.id,
        value: entry.value,
        label: entry.label,
        color: entry.color ?? null,
        icon: entry.icon ?? null,
      })),
    })
  } catch (err) {
    if (isCrudHttpError(err)) {
      return NextResponse.json(err.body, { status: err.status })
    }
    logger.error('dermat_sales_flow.dictionaries.GET Unexpected error', { err })
    return NextResponse.json({ error: 'Failed to load dictionary.' }, { status: 500 })
  }
}

const dictionaryEntrySchema = z.object({
  id: z.string().uuid(),
  value: z.string(),
  label: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
})

const dictionaryResponseSchema = z.object({
  id: z.string().uuid().nullable(),
  entries: z.array(dictionaryEntrySchema),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Sales Flow',
  summary: 'Dermat sales flow dictionary lookup',
  methods: {
    GET: {
      summary: 'Get dictionary entries by key (category, packaging_type)',
      description: 'Returns dictionary entries for a Dermat-specific dictionary key.',
      responses: [
        {
          status: 200,
          description: 'Dictionary entries',
          schema: dictionaryResponseSchema,
        },
      ],
    },
  },
}
