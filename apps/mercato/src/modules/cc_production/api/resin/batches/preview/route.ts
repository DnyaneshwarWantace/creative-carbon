import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../../cc_store/lib/server'
import { findBatch, reopenPreview } from '../../../../lib/resin'
import { plantErrorResponse } from '../../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
}

const querySchema = z.object({ id: z.string().uuid(), action: z.enum(['reopen']).default('reopen') })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which batch' }, { status: 400 })
  try {
    return NextResponse.json(await reopenPreview(ctx, await findBatch(ctx, parsed.data.id)))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'What reopening a resin batch would undo, and what blocks it, before anything moves',
  methods: {
    GET: { summary: 'Correction preview', tags: ['Creative Carbon Resin'], query: querySchema, responses: [{ status: 200, description: 'Preview', schema: z.object({ undo: z.array(z.string()), blockedBy: z.array(z.object({ label: z.string(), href: z.string().nullable() })) }).passthrough() }] },
  },
}

export { GET }
