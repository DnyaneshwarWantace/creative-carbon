import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { QaDocument } from '../../data/entities'
import { qaDocumentInputSchema, qaDocumentListSchema } from '../../data/validators'
import { createDocument, documentView, findDocument } from '../../lib/documents'
import { qcErrorResponse, resolveQcContext, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_quality.documents'] },
}

async function GET(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = qaDocumentListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (parsed.data.id) {
      const doc = await findDocument(ctx, parsed.data.id)
      return NextResponse.json(documentView(doc, await ctx.em.find(QaDocument, { ...scope, docNo: doc.docNo })))
    }
    const where: Record<string, unknown> = { ...scope }
    if (parsed.data.view === 'active' || parsed.data.view === 'review_due') where.status = 'active'
    if (parsed.data.view === 'history') where.status = { $in: ['superseded', 'withdrawn'] }
    if (parsed.data.search) {
      const term = `%${parsed.data.search.replace(/[%_]/g, '')}%`
      where.$or = [{ docNo: { $ilike: term } }, { title: { $ilike: term } }, { docType: { $ilike: term } }, { department: { $ilike: term } }]
    }
    const docs = await ctx.em.find(QaDocument, where, { orderBy: { docNo: 'asc', version: 'desc' }, limit: 500 })
    const all = await ctx.em.find(QaDocument, { ...scope, docNo: { $in: [...new Set(docs.map((doc) => doc.docNo))] } })
    let items = docs.map((doc) => documentView(doc, all.filter((entry) => entry.docNo === doc.docNo)))
    if (parsed.data.view === 'review_due') items = items.filter((item) => item.reviewDue || (item.reviewInDays !== null && item.reviewInDays <= 30))
    return NextResponse.json({ items })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = qaDocumentInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter document no., title, type and effective date' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, { resourceKind: 'dermat_quality.document', resourceId: 'new', operation: 'create', payload: parsed.data as Record<string, unknown> }, async () => documentView(await createDocument(ctx, parsed.data)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Quality',
  summary: 'QA documents register',
  methods: {
    GET: { summary: 'Current documents, due for review, old versions, or one document with its versions', tags: ['Dermat Quality'], query: qaDocumentListSchema, responses: [{ status: 200, description: 'Documents', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Issue a new controlled document (version 1)', tags: ['Dermat Quality'], requestBody: { schema: qaDocumentInputSchema }, responses: [{ status: 201, description: 'Document', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST }
