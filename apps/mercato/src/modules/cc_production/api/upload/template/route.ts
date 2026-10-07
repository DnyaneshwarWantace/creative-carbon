import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { uploadRegister } from '../../../lib/upload/registers'
import { buildTemplate } from '../../../lib/upload/workbook'
import { listValues } from '../../../lib/upload/service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
}

const querySchema = z.object({ register: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which register' }, { status: 400 })
  const register = uploadRegister(parsed.data.register)
  if (!register) return NextResponse.json({ error: 'Unknown register' }, { status: 404 })
  if (!(await hasFeatures(ctx, [register.viewFeature]))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const buffer = await buildTemplate(register, await listValues(ctx, register), parsed.data.date ?? today)
  const name = `${register.label.replace(/[^A-Za-z0-9]+/g, '-')}-template${register.dated ? `-${parsed.data.date ?? today}` : ''}.xlsx`
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { 'content-type': XLSX, 'content-disposition': `attachment; filename="${name}"` } })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Upload',
  summary: 'Excel template of a register',
  methods: { GET: { summary: 'Download the .xlsx template (columns in register order, lists as dropdowns, date filled in)', tags: ['Creative Carbon Upload'], query: querySchema, responses: [{ status: 200, description: 'xlsx file', schema: z.any() }] } },
}

export { GET }
