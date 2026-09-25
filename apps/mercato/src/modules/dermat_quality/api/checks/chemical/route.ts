import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { decideSchema } from '../../../data/validators'
import { checkView, decidePart, findCheck } from '../../../lib/checks'
import { qcErrorResponse, resolveQcContext, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_quality.chemical'] },
}

async function POST(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = decideSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  try {
    const check = await findCheck(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_quality.check', resourceId: check.id, current: check.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_quality.check', resourceId: check.id, operation: 'custom', payload: parsed.data }, async () => {
      await decidePart(ctx, check, 'chemical', parsed.data.result, parsed.data.note ?? null)
      await ctx.em.flush()
      return NextResponse.json(await checkView(ctx, check))
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat QC',
  summary: 'Pass or fail the chemical test',
  methods: {
    POST: {
      summary: 'Pass or fail the chemical part of a QC check (name and time stamped)',
      tags: ['Dermat QC'],
      requestBody: { schema: decideSchema },
      responses: [{ status: 200, description: 'Updated check', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 400, description: 'Observations missing or no reason for fail' }, { status: 409, description: 'Already decided' }],
    },
  },
}

export { POST }
