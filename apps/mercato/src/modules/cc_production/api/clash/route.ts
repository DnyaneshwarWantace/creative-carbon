import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { clashSchema } from '../../data/validators'
import { logClash } from '../../lib/owner'
import { plantErrorResponse } from '../../lib/server'

export const metadata = { POST: { requireAuth: true } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = clashSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which screen and record' }, { status: 400 })
  try {
    const clash = await logClash(ctx, parsed.data, await currentUserName(ctx))
    return NextResponse.json({ id: clash.id }, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Log a save made offline that overwrote a newer change (last save wins; the owner sees the clash)',
  methods: { POST: { summary: 'Log a sync clash', tags: ['Creative Carbon Owner'], requestBody: { schema: clashSchema }, responses: [{ status: 201, description: 'Logged', schema: z.object({ id: z.string() }) }] } },
}

export { POST }
