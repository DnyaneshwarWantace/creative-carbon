import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { productUpdateSchema } from '@open-mercato/core/modules/catalog/data/validators'
import { splitCustomFieldPayload } from '@open-mercato/shared/lib/crud/custom-fields'
import { PRODUCT_KINDS, CC_WAREHOUSE, type ProductKind } from '../../lib/kinds'
import { KIND_CONFIG } from '../../lib/kindConfig'
import { createProductWithStockSetup } from '../../lib/createProduct'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['catalog.products.manage', 'wms.adjust_inventory'],
  },
}

const KIND_CODES = PRODUCT_KINDS.map((kind) => kind.code) as [ProductKind, ...ProductKind[]]

const STORE_BY_KIND: Record<ProductKind, string> = {
  raw_material: 'RM-STORE',
  packing_material: 'PM-STORE',
  bulk: 'PRODUCTION',
  finished_goods: 'FG-STORE',
  rnd: 'RM-STORE',
}

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kilo: 'kg',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  l: 'l',
  ltr: 'l',
  litre: 'l',
  liter: 'l',
  liters: 'l',
  litres: 'l',
  ml: 'ml',
  mls: 'ml',
  nos: 'nos',
  no: 'nos',
  numbers: 'nos',
  number: 'nos',
  pc: 'pc',
  pcs: 'pc',
  piece: 'pc',
  pieces: 'pc',
}

const rowSchema = z.object({
  name: z.string().trim().max(255).optional(),
  code: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(30).optional(),
  stock: z.string().trim().max(40).optional(),
  hsn: z.string().trim().max(40).optional(),
  fields: z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().max(2000)).default({}),
})

const bodySchema = z.object({
  kind: z.enum(KIND_CODES),
  updateExisting: z.boolean().default(true),
  rows: z.array(rowSchema).min(1).max(100),
})

const rowResultSchema = z.object({
  row: z.number(),
  status: z.enum(['created', 'updated', 'skipped', 'failed']),
  name: z.string(),
  message: z.string().optional(),
})

const responseSchema = z.object({ results: z.array(rowResultSchema) })

type RowResult = z.infer<typeof rowResultSchema>

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

async function resolveContext(request: Request): Promise<CommandRuntimeContext | null> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(request)
  if (!auth?.tenantId) return null
  const organizationScope = await resolveOrganizationScopeForRequest({
    container,
    auth,
    request,
  })
  return {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: organizationScope?.selectedId ?? auth.orgId ?? null,
    organizationIds: organizationScope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request,
  }
}

async function POST(req: Request) {
  const ctx = await resolveContext(req)
  if (!ctx?.auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = ctx.auth.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!organizationId) return NextResponse.json({ error: 'Select an organization first' }, { status: 400 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid import data', details: parsed.error.flatten() }, { status: 400 })
  const { kind, rows, updateExisting } = parsed.data
  const config = KIND_CONFIG[kind]
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorCandidates = [ctx.auth.sub, ctx.auth.userId, ctx.auth.keyId]
  const actorId = actorCandidates.find((value): value is string => typeof value === 'string' && UUID_RE.test(value)) ?? ''

  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: actorId || 'system', tenantId, organizationId },
    input: { resourceKind: 'cc_products.import', resourceId: kind, operation: 'custom', mutationPayload: { kind, rowCount: rows.length } },
  })
  if (!guard.ok) return guard.response

  const em = (ctx.container.resolve('em') as EntityManager).fork()
  const connection = em.getConnection()
  const commandBus = ctx.container.resolve('commandBus') as CommandBus

  const kindLabel = PRODUCT_KINDS.find((entry) => entry.code === kind)?.label ?? ''
  const [rootCategory] = await connection.execute<Array<{ id: string }>>(
    `select id from catalog_product_categories where tenant_id = ? and organization_id = ? and name = ? and parent_id is null and deleted_at is null limit 1`,
    [tenantId, organizationId, kindLabel],
  )
  const [defaultTax] = await connection.execute<Array<{ id: string }>>(
    `select id from sales_tax_rates where tenant_id = ? and organization_id = ? and is_default = true and deleted_at is null limit 1`,
    [tenantId, organizationId],
  )
  const [store] = await connection.execute<Array<{ warehouse_id: string; location_id: string }>>(
    `select w.id as warehouse_id, l.id as location_id
       from wms_warehouses w join wms_warehouse_locations l on l.warehouse_id = w.id and l.deleted_at is null
      where w.tenant_id = ? and w.organization_id = ? and w.code = ? and l.code = ? and w.deleted_at is null limit 1`,
    [tenantId, organizationId, CC_WAREHOUSE.code, STORE_BY_KIND[kind]],
  )
  const allowedFieldKeys = new Set(
    (
      await connection.execute<Array<{ key: string }>>(
        `select key from custom_field_defs
          where entity_id = 'catalog:catalog_product' and deleted_at is null and is_active = true
            and (tenant_id = ? or tenant_id is null)
            and (config_json->>'fieldset' = ? or jsonb_exists(coalesce(config_json->'fieldsets', '[]'::jsonb), ?))`,
        [tenantId, kind, kind],
      )
    ).map((row) => row.key),
  )

  const results: RowResult[] = []
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1
    const name = (row.name ?? '').trim()
    if (!name) {
      results.push({
        row: rowNumber,
        status: 'skipped',
        name: '',
        message: 'No name',
      })
      continue
    }
    try {
      const unitRaw = (row.unit ?? '').toLowerCase().replace(/[^a-z]/g, '')
      const unit = UNIT_ALIASES[unitRaw] && config.units.includes(UNIT_ALIASES[unitRaw]) ? UNIT_ALIASES[unitRaw] : config.defaultUnit
      const code = (row.code ?? '').trim()
      const custom: Record<string, unknown> = { cf_item_code: code || null }
      if (row.hsn) custom.cf_hsn_code = row.hsn
      for (const [key, value] of Object.entries(row.fields)) {
        if (allowedFieldKeys.has(key) && value.trim()) custom[`cf_${key}`] = value.trim()
      }

      let existingId: string | null = null
      if (code) {
        const [existing] = await connection.execute<Array<{ id: string }>>(
          `select p.id from catalog_products p
             join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product'
                  and v.field_key = 'item_code' and v.deleted_at is null
            where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null
              and p.custom_fieldset_code = ? and lower(v.value_text) = lower(?) limit 1`,
          [tenantId, organizationId, kind, code],
        )
        existingId = existing?.id ?? null
      }

      if (existingId) {
        if (!updateExisting) {
          results.push({
            row: rowNumber,
            status: 'skipped',
            name,
            message: `Code ${code} already exists`,
          })
          continue
        }
        const updateSplit = splitCustomFieldPayload(custom)
        const updateInput = productUpdateSchema.parse({ id: existingId, title: name, tenantId, organizationId })
        await commandBus.execute('catalog.products.update', {
          input: { ...updateInput, customFields: updateSplit.custom },
          ctx,
        })
        results.push({ row: rowNumber, status: 'updated', name })
        continue
      }

      const { productId, variantId } = await createProductWithStockSetup(commandBus, ctx, connection, {
        title: name,
        kind,
        unit,
        categoryId: rootCategory?.id ?? null,
        taxRateId: defaultTax?.id ?? null,
        custom,
        tenantId,
        organizationId,
      })

      const stock = numberOrNull(row.stock)
      let stockNote: string | undefined
      if (stock && stock > 0 && store && actorId) {
        try {
          await commandBus.execute('wms.inventory.receive', {
            input: {
              tenantId,
              organizationId,
              warehouseId: store.warehouse_id,
              locationId: store.location_id,
              catalogVariantId: variantId,
              lotNumber: 'OPENING',
              quantity: stock,
              referenceType: 'manual',
              referenceId: randomUUID(),
              performedBy: actorId,
              reason: 'Opening stock (import)',
            },
            ctx,
          })
        } catch (stockError) {
          stockNote = `Created, opening stock not booked: ${stockError instanceof Error ? stockError.message : 'unknown error'}`.slice(
            0,
            300,
          )
        }
      }
      results.push({
        row: rowNumber,
        status: 'created',
        name,
        message: stockNote,
      })
    } catch (err) {
      const message =
        err instanceof z.ZodError ? err.issues.map((issue) => issue.message).join('; ') : err instanceof Error ? err.message : 'Failed'
      results.push({
        row: rowNumber,
        status: 'failed',
        name,
        message: message.slice(0, 300),
      })
    }
  }

  await guard.runAfterSuccess()
  return NextResponse.json({ results })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Products',
  summary: 'Import products of one type from spreadsheet rows',
  methods: {
    POST: {
      summary: 'Create or update up to 100 products of one type; stock is booked as opening stock',
      tags: ['Creative Carbon Products'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'Per-row result', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid import data' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
  },
}

export { POST }
