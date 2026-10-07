import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { uploadRegister } from '../../../lib/upload/registers'
import { buildErrorFile } from '../../../lib/upload/workbook'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
}

const bodySchema = z.object({
  register: z.string().min(1),
  rows: z.array(z.object({ row: z.number(), values: z.record(z.string(), z.string()), reason: z.string() })).min(1).max(5000),
})

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the register and the failed rows' }, { status: 400 })
  const register = uploadRegister(parsed.data.register)
  if (!register) return NextResponse.json({ error: 'Unknown register' }, { status: 404 })
  const buffer = await buildErrorFile(register, parsed.data.rows)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${register.label.replace(/[^A-Za-z0-9]+/g, '-')}-rows-to-fix.xlsx"` },
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Upload',
  summary: 'File of rows that need fixing',
  methods: { POST: { summary: 'Build an .xlsx with only the failed rows and a Reason column', tags: ['Creative Carbon Upload'], requestBody: { schema: bodySchema }, responses: [{ status: 200, description: 'xlsx file', schema: z.any() }] } },
}

export { POST }
