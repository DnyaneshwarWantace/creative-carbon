import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { retestSchema } from '../../../data/validators'
import { QcError, computeStatus } from '../../../lib/service'
import { checkView, findCheck } from '../../../lib/checks'
import { currentUserName, qcErrorResponse, resolveQcContext, runGuarded } from '../../../lib/server'
import { applyInwardDecision } from '../../../../dermat_purchase/lib/inward'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_quality.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = retestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why it is re-tested' }, { status: 400 })
  try {
    const check = await findCheck(ctx, parsed.data.id)
    if (check.status !== 'failed') throw new QcError('Only a failed check can be re-tested', 409)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_quality.check', resourceId: check.id, current: check.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_quality.check', resourceId: check.id, operation: 'custom', payload: parsed.data }, async () => {
      const failed = new Set([check.chemicalStatus === 'fail' ? 'chemical' : null, check.microStatus === 'fail' ? 'micro' : null])
      if (failed.has('chemical')) check.chemicalStatus = 'pending'
      if (failed.has('micro')) check.microStatus = 'pending'
      check.results = (check.results ?? []).map((row) => (failed.has(row.test) ? { ...row, observation: '', remark: '' } : row))
      check.status = computeStatus(check)
      check.history = [...(check.history ?? []), { action: 'retest', by: await currentUserName(ctx), at: new Date().toISOString(), note: parsed.data.note }]
      check.updatedAt = new Date()
      await ctx.em.flush()
      if (check.operation === 'purchase_receipt') await applyInwardDecision(req, check.id)
      return NextResponse.json(await checkView(ctx, check))
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat QC',
  summary: 'Re-test a failed QC check',
  methods: {
    POST: {
      summary: 'Reset the failed parts of a check to pending for a re-test',
      tags: ['Dermat QC'],
      requestBody: { schema: retestSchema },
      responses: [{ status: 200, description: 'Updated check', schema: z.object({ id: z.string() }).passthrough() }],
    },
  },
}

export { POST }
