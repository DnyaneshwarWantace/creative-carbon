import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { listPeople } from '../../../cc_orders/lib/server'

export const metadata = {
  GET: { requireAuth: true },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json({ items: await listPeople(ctx) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'People who can be mentioned in a comment',
  methods: {
    GET: {
      summary: 'List users (id and name)',
      tags: ['Creative Carbon Activity'],
      responses: [{ status: 200, description: 'Users', schema: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }) }],
    },
  },
}

export { GET }
