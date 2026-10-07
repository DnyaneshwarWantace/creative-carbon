import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { poEmailSchema } from '../../../data/validators'
import { emailConfigured, emailPo } from '../../../lib/poEmail'
import { findPo } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.manage'] },
}

async function GET() {
  return NextResponse.json({ configured: emailConfigured() })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poEmailSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter the vendor email' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.order', resourceId: po.id, operation: 'custom', payload: parsed.data }, async () => {
      const view = await emailPo(ctx, po, { to: parsed.data.to, cc: parsed.data.cc, message: parsed.data.message ?? null })
      return NextResponse.json({ ...view, history: po.history ?? [], updatedAt: po.updatedAt.toISOString() })
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Email an approved PO to the vendor',
  methods: {
    GET: { summary: 'Whether email sending is set up on this server', tags: ['Creative Carbon Purchase'], responses: [{ status: 200, description: 'Status', schema: z.object({ configured: z.boolean() }) }] },
    POST: { summary: 'Email an approved PO to the vendor (and copies)', tags: ['Creative Carbon Purchase'], requestBody: { schema: poEmailSchema }, responses: [{ status: 200, description: 'The PO', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'PO not approved, or email not set up' }] },
  },
}

export { GET, POST }
