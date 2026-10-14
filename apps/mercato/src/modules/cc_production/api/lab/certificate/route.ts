import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { findLabTest, labDetail, saveCertificate } from '../../../lib/lab'
import { certificateSchema } from '../../../lib/testCertificate'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = { PUT: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] } }

const inputSchema = z.object({ id: z.string().uuid(), certificate: certificateSchema })

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the test certificate' }, { status: 400 })
  try {
    const row = await findLabTest(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.lab_test', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.lab_test', resourceId: row.id, operation: 'update', payload: parsed.data }, async () => {
      await saveCertificate(ctx, row, parsed.data.certificate, byName)
      return labDetail(ctx, row)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'The test certificate on a lab test: header, IS 2036 rows with observed values, criteria legend, tested and verified by',
  methods: { PUT: { summary: 'Save the test certificate (OK / Not OK worked out; result set when every value is in)', tags: ['Creative Carbon Finishing'], requestBody: { schema: inputSchema }, responses: [{ status: 200, description: 'Lab test', schema: z.object({}).passthrough() }] } },
}

export { PUT }
