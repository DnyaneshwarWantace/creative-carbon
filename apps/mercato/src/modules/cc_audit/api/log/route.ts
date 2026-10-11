import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { activityRows, activityWorkbook } from '../../lib/report'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_audit.view'] } }

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  actor: z.string().trim().max(120).optional(),
  type: z.string().trim().max(60).optional(),
  kind: z.enum(['change', 'stage', 'document', 'correction', 'comment', 'attachment', 'system']).optional(),
  format: z.enum(['json', 'xlsx']).default('json'),
})

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Check the filters' }, { status: 400 })
  const { format, ...filter } = parsed.data
  if (format === 'json') return NextResponse.json({ items: await activityRows(ctx, filter, null, 500) })
  const rows = await activityRows(ctx, filter, null)
  const buffer = await activityWorkbook(rows)
  const name = `activity-log-${filter.from ?? 'start'}-to-${filter.to ?? 'today'}.xlsx`
  return new NextResponse(new Uint8Array(buffer), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}"` } })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'The activity log across all records for auditors, filtered by date, person, record type and kind; Excel export',
  methods: { GET: { summary: 'Activity log (?format=xlsx to download)', tags: ['Creative Carbon Activity'], query: querySchema, responses: [{ status: 200, description: 'Rows or the Excel file', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] } },
}

export { GET }
