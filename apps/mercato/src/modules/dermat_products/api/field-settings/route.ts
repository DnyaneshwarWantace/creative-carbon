import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { runCrudMutationGuardAfterSuccess, validateCrudMutationGuard } from '@open-mercato/shared/lib/crud/mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import { PRODUCT_KINDS } from '../../lib/kinds'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['catalog.products.manage'] },
}

const MODULE_ID = 'dermat_products'
const SETTING_KEY = 'hiddenFields'

const kindSchema = z.enum(PRODUCT_KINDS.map((kind) => kind.code) as [string, ...string[]])
const fieldKeySchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/)
const hiddenFieldsSchema = z.record(kindSchema, z.array(fieldKeySchema).max(50))
const bodySchema = z.object({ kind: kindSchema, hiddenFields: z.array(fieldKeySchema).max(50) })
const responseSchema = z.object({ hiddenFields: hiddenFieldsSchema })

async function readHiddenFields(configService: ModuleConfigService, tenantId: string) {
  const value = await configService.getValue<unknown>(MODULE_ID, SETTING_KEY, { defaultValue: {}, scope: { tenantId } })
  const parsed = hiddenFieldsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : {}
}

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const container = await createRequestContainer()
  const configService = container.resolve('moduleConfigService') as ModuleConfigService
  return NextResponse.json({ hiddenFields: await readHiddenFields(configService, auth.tenantId) })
}

async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid field settings' }, { status: 400 })
  const container = await createRequestContainer()
  const actorId = (typeof auth.sub === 'string' && auth.sub) || 'system'
  const guardInput = {
    tenantId: auth.tenantId,
    organizationId: auth.orgId ?? null,
    userId: actorId,
    resourceKind: 'dermat_products.field_settings',
    resourceId: parsed.data.kind,
    operation: 'custom' as const,
    requestMethod: req.method,
    requestHeaders: req.headers,
    mutationPayload: parsed.data,
  }
  const guardResult = await validateCrudMutationGuard(container, guardInput)
  if (guardResult && !guardResult.ok) return NextResponse.json(guardResult.body, { status: guardResult.status })
  const configService = container.resolve('moduleConfigService') as ModuleConfigService
  const current = await readHiddenFields(configService, auth.tenantId)
  const next = { ...current, [parsed.data.kind]: Array.from(new Set(parsed.data.hiddenFields)) }
  await configService.setValue(MODULE_ID, SETTING_KEY, next, { tenantId: auth.tenantId })
  if (guardResult?.ok && guardResult.shouldRunAfterSuccess) {
    await runCrudMutationGuardAfterSuccess(container, { ...guardInput, metadata: guardResult.metadata ?? null })
  }
  return NextResponse.json({ hiddenFields: next })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Products',
  summary: 'Which optional product fields are hidden per product type',
  methods: {
    GET: {
      summary: 'Read hidden product fields per type',
      tags: ['Dermat Products'],
      responses: [{ status: 200, description: 'Hidden field keys per product type', schema: responseSchema }],
    },
    PUT: {
      summary: 'Set hidden product fields for one product type',
      tags: ['Dermat Products'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'Updated hidden field keys', schema: responseSchema }],
      errors: [{ status: 400, description: 'Invalid field settings' }],
    },
  },
}

export { GET, PUT }
