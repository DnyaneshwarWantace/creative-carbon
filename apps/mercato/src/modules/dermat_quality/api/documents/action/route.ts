import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { QaDocument } from '../../../data/entities'
import { qaDocumentActionSchema } from '../../../data/validators'
import { actOnDocument, documentView, findDocument } from '../../../lib/documents'
import { qcErrorResponse, resolveQcContext, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_quality.documents'] },
}

async function POST(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = qaDocumentActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const doc = await findDocument(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_quality.document', resourceId: doc.id, current: doc.updatedAt, request: req })
    const result = await runGuarded(ctx, req, { resourceKind: 'dermat_quality.document', resourceId: doc.id, operation: 'update', payload: parsed.data as Record<string, unknown> }, async () => {
      const current = await actOnDocument(ctx, doc, parsed.data)
      return documentView(current, await ctx.em.find(QaDocument, { docNo: current.docNo, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }))
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Quality',
  summary: 'Revise or withdraw a QA document',
  methods: {
    POST: { summary: 'Issue the next version (old one kept as superseded) or withdraw the document', tags: ['Dermat Quality'], requestBody: { schema: qaDocumentActionSchema }, responses: [{ status: 200, description: 'Document', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
