import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { uploadDetail, uploadHistory } from '../../../lib/upload/service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
}

const querySchema = z.object({ register: z.string().optional(), id: z.string().uuid().optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  if (parsed.data.id) {
    const detail = await uploadDetail(ctx, parsed.data.id)
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }
  return NextResponse.json({ items: await uploadHistory(ctx, parsed.data.register) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Upload',
  summary: 'Upload history',
  methods: { GET: { summary: 'Last 100 uploads, newest first, or one upload with every row that needs fixing (?id=)', tags: ['Creative Carbon Upload'], query: querySchema, responses: [{ status: 200, description: 'Uploads', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }) }] } },
}

export { GET }
