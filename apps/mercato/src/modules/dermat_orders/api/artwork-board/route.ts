import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { resolveOrderContext } from '../../lib/server'
import { orderErrorResponse } from '../../lib/guard'
import { artworkBoard } from '../../lib/artworkBoard'
import { withStageOverrides } from '../../lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const querySchema = z.object({ includeDone: z.string().optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
    try {
      return NextResponse.json(await artworkBoard(ctx, { includeDone: parseBooleanWithDefault(parsed.data.includeDone, false) }))
    } catch (error) {
      return orderErrorResponse(error)
    }
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Artwork jobs and packing material status',
  methods: {
    GET: {
      summary: 'Artwork job per order with step progress, and every order x packing item with its designer status',
      tags: ['Dermat Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Board', schema: z.object({ jobs: z.array(z.object({}).passthrough()), items: z.array(z.object({}).passthrough()) }) }],
    },
  },
}

export { GET }
