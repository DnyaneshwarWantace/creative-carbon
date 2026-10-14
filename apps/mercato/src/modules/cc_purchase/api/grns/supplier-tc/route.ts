import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { findGrn, grnView, setSupplierTc } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.receive'] },
}

const bodySchema = z.object({ id: z.string().uuid(), tcNo: z.string().trim().max(120).nullable().optional(), waivedReason: z.string().trim().max(500).nullable().optional() })

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the certificate number' }, { status: 400 })
  const tcNo = parsed.data.tcNo?.trim() || null
  const waivedReason = parsed.data.waivedReason?.trim() || null
  if (!tcNo && waivedReason && waivedReason.length < 3) return NextResponse.json({ error: 'Write why the certificate is not needed' }, { status: 400 })
  try {
    const grn = await findGrn(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.grn', resourceId: grn.id, current: grn.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: grn.id, operation: 'custom', payload: parsed.data }, async () => {
      await setSupplierTc(ctx, grn, tcNo, waivedReason)
      return NextResponse.json(await grnView(ctx, grn))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Record the supplier test certificate number on a goods receipt, or why it is not needed',
  methods: { POST: { summary: 'Set the supplier test certificate', tags: ['Creative Carbon Purchase'], requestBody: { schema: bodySchema }, responses: [{ status: 200, description: 'The GRN', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Changed by someone else' }] } },
}

export { POST }
