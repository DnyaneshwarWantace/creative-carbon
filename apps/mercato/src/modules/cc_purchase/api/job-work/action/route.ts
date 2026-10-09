import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { jobWorkActionSchema } from '../../../data/validators'
import { cancelJobWork, findJobWork, jobWorkView, receiveJobWork } from '../../../lib/jobWork'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.jobwork'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = jobWorkActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry' }, { status: 400 })
  try {
    const challan = await findJobWork(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.job_work', resourceId: challan.id, current: challan.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.job_work', resourceId: challan.id, operation: 'custom', payload: parsed.data }, async () => {
      if (parsed.data.action === 'receive') await receiveJobWork(ctx, challan, parsed.data)
      else await cancelJobWork(ctx, challan, parsed.data.reason)
      return NextResponse.json(jobWorkView(challan))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Receive material back from the job worker (with process loss), or cancel a challan nothing came back on',
  methods: {
    POST: { summary: 'Receive back or cancel', tags: ['Creative Carbon Purchase'], requestBody: { schema: jobWorkActionSchema }, responses: [{ status: 200, description: 'Challan', schema: z.object({ id: z.string(), status: z.string() }).passthrough() }], errors: [{ status: 409, description: 'More than is out, already back, or changed by someone else' }] },
  },
}

export { POST }
