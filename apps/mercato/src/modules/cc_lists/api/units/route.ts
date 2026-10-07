import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_lists.manage'] },
}

type EntryRow = { id: string; value: string; label: string; is_default: boolean; position: number | null; updated_at: Date | null }

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const connection = ctx.em.getConnection()
  const [dictionary] = await connection.execute<Array<{ id: string }>>(
    `select id from dictionaries where key = 'unit' and deleted_at is null and tenant_id = ? and organization_id = ? limit 1`,
    [ctx.tenantId, ctx.organizationId],
  )
  if (!dictionary) return NextResponse.json({ dictionaryId: null, items: [] })
  const entries = await connection.execute<EntryRow[]>(
    `select id, value, label, is_default, position, updated_at from dictionary_entries where dictionary_id = ? order by position nulls last, value`,
    [dictionary.id],
  )
  const usage = await connection.execute<Array<{ unit: string; products: string }>>(
    `select default_unit as unit, count(*) as products from catalog_products where tenant_id = ? and organization_id = ? and deleted_at is null and default_unit is not null group by default_unit`,
    [ctx.tenantId, ctx.organizationId],
  )
  const used = new Map(usage.map((row) => [row.unit, Number(row.products)]))
  return NextResponse.json({
    dictionaryId: dictionary.id,
    items: entries.map((entry) => ({ id: entry.id, value: entry.value, label: entry.label, isDefault: entry.is_default, products: used.get(entry.value) ?? 0, updatedAt: entry.updated_at ? new Date(entry.updated_at).toISOString() : null })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Lists',
  summary: 'Units of measure used on products, with how many products use each',
  methods: {
    GET: { summary: 'Units with product counts', tags: ['Creative Carbon Lists'], responses: [{ status: 200, description: 'Units', schema: z.object({ dictionaryId: z.string().nullable(), items: z.array(z.object({ value: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
