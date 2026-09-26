import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { hasFeatures, resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { rdActionSchema } from '../../../data/validators'
import { actOnRequest, findRequest, requestView } from '../../../lib/service'
import { rdErrorResponse, runRdGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_rnd.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const needed = parsed.data.action === 'feedback' ? ['dermat_rnd.request'] : ['dermat_rnd.manage']
  if (!(await hasFeatures(ctx, needed))) return NextResponse.json({ error: parsed.data.action === 'feedback' ? 'Only Sales or R&D can record client feedback' : 'Only R&D can do this' }, { status: 403 })
  try {
    const request = await findRequest(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_rnd.request', resourceId: request.id, current: request.updatedAt, request: req })
    const result = await runRdGuarded(ctx, req, request.id, 'update', parsed.data as Record<string, unknown>, async () => {
      await actOnRequest(ctx, request, parsed.data)
      return requestView(request)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return rdErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat R&D',
  summary: 'Move an R&D request',
  methods: {
    POST: { summary: 'Start, send a sample, record client feedback, drop or reopen', tags: ['Dermat R&D'], requestBody: { schema: rdActionSchema }, responses: [{ status: 200, description: 'Request', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
