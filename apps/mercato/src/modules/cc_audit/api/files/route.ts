import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { currentUserName } from '../../../cc_orders/lib/server'
import { filesQuerySchema, registerFileSchema } from '../../data/validators'
import { recordAccess } from '../../lib/access'
import { FileError, RECORD_FILES_ENTITY, recordFiles, registerFile } from '../../lib/files'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['attachments.view'] },
  POST: { requireAuth: true, requireFeatures: ['attachments.manage'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = filesQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 })
  const access = await recordAccess(ctx, parsed.data.type)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  return NextResponse.json({ entityId: RECORD_FILES_ENTITY, recordId: `${parsed.data.type}:${parsed.data.id}`, items: await recordFiles(ctx, parsed.data.type, parsed.data.id) })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = registerFileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const access = await recordAccess(ctx, parsed.data.type)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  try {
    const item = await registerFile({ ...ctx, userName: await currentUserName(ctx) }, parsed.data)
    return NextResponse.json({ ok: true, item })
  } catch (error) {
    if (error instanceof FileError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

const fileSchema = z.object({ id: z.string(), fileName: z.string(), mimeType: z.string(), fileSize: z.number(), at: z.string(), by: z.string().nullable(), label: z.string().nullable(), version: z.number() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'Photos and PDFs attached to any record, with earlier versions kept',
  methods: {
    GET: {
      summary: 'Files of one record (current version first, older versions under each)',
      tags: ['Creative Carbon Activity'],
      query: filesQuerySchema,
      responses: [{ status: 200, description: 'Files', schema: z.object({ entityId: z.string(), recordId: z.string(), items: z.array(fileSchema) }) }],
    },
    POST: {
      summary: 'Record an uploaded file on the record (optionally replacing an older one, which is kept) and log it in the timeline',
      tags: ['Creative Carbon Activity'],
      requestBody: { contentType: 'application/json', schema: registerFileSchema },
      responses: [{ status: 200, description: 'Recorded', schema: z.object({ ok: z.boolean(), item: fileSchema.nullable() }) }],
      errors: [{ status: 404, description: 'File not on this record' }, { status: 409, description: 'Already recorded or already replaced' }],
    },
  },
}

export { GET, POST }
