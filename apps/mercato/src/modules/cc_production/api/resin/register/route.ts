import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { chemicalRegisterSchema } from '../../../data/validators'
import { chemicalRegister } from '../../../lib/chemicals'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = chemicalRegisterSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pick a chemical and a month' }, { status: 400 })
  try {
    return NextResponse.json(await chemicalRegister(ctx, parsed.data.item, parsed.data.month))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'Chemical register: one chemical, one month, in the book columns (O.B., Received, Total, Use, Balance; Phenol adds Water and Resin)',
  methods: {
    GET: { summary: 'Chemical register page (?item=&month=YYYY-MM)', tags: ['Creative Carbon Resin'], query: chemicalRegisterSchema, responses: [{ status: 200, description: 'Register', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
