import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, hasFeatures, resolveOrderContext } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { UploadBatch } from '../../data/entities'
import { UPLOAD_REGISTERS, uploadRegister } from '../../lib/upload/registers'
import { parsePastedRows, parseUploadFile } from '../../lib/upload/parse'
import { fileHash, runUpload } from '../../lib/upload/service'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.upload.use'] },
}

const MAX_BYTES = 10 * 1024 * 1024

const pastedSchema = z.object({
  register: z.string().min(1),
  dryRun: z.boolean().default(true),
  fileName: z.string().trim().max(200).default('Pasted rows'),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(5000),
})

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const items = []
  for (const register of UPLOAD_REGISTERS) {
    if (!(await hasFeatures(ctx, [register.viewFeature]))) continue
    const last = await ctx.em.findOne(UploadBatch, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, registerKey: register.key }, { orderBy: { createdAt: 'desc' } })
    items.push({
      key: register.key,
      label: register.label,
      department: register.department,
      paperRef: register.paperRef,
      hint: register.hint,
      dated: register.dated,
      canUpload: await hasFeatures(ctx, [register.manageFeature]),
      columns: register.columns.map((column) => ({ key: column.key, label: column.label, required: Boolean(column.required) })),
      lastUpload: last ? { at: last.createdAt.toISOString(), byName: last.byName ?? null, total: last.totalRows, failed: last.failedRows, fileName: last.fileName } : null,
    })
  }
  return NextResponse.json({ items })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    const contentType = req.headers.get('content-type') ?? ''
    let registerKey = ''
    let dryRun = true
    let fileName = ''
    let hash = ''
    let parse: (register: NonNullable<ReturnType<typeof uploadRegister>>) => Promise<Awaited<ReturnType<typeof parseUploadFile>>>
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      registerKey = String(form.get('register') ?? '')
      dryRun = String(form.get('dryRun') ?? 'true') !== 'false'
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the Excel or CSV file to upload' }, { status: 400 })
      if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 10 MB' }, { status: 400 })
      if (!/\.(xlsx|csv|txt)$/i.test(file.name)) return NextResponse.json({ error: 'Upload an .xlsx or .csv file' }, { status: 400 })
      const buffer = Buffer.from(await file.arrayBuffer())
      fileName = file.name
      hash = fileHash(buffer)
      parse = (register) => parseUploadFile(register, file.name, buffer)
    } else {
      const parsed = pastedSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return NextResponse.json({ error: 'Send a file, or the register and its rows' }, { status: 400 })
      registerKey = parsed.data.register
      dryRun = parsed.data.dryRun
      fileName = parsed.data.fileName
      hash = fileHash(JSON.stringify(parsed.data.rows))
      parse = async (register) => parsePastedRows(register, parsed.data.rows)
    }
    const register = uploadRegister(registerKey)
    if (!register) return NextResponse.json({ error: 'Unknown register' }, { status: 404 })
    if (!(await hasFeatures(ctx, [register.manageFeature]))) return NextResponse.json({ error: `You cannot upload ${register.label.toLowerCase()}` }, { status: 403 })
    let parsed: Awaited<ReturnType<typeof parseUploadFile>>
    try {
      parsed = await parse(register)
    } catch {
      return NextResponse.json({ error: 'The file could not be read. Save it as .xlsx or .csv and try again.' }, { status: 400 })
    }
    if (parsed.missingColumns.length) return NextResponse.json({ error: `The sheet has no ${parsed.missingColumns.join(', ')} column. Use the template from the Upload centre.`, missingColumns: parsed.missingColumns }, { status: 400 })
    if (!parsed.rows.length) return NextResponse.json({ error: 'No rows found under the header row' }, { status: 400 })
    const byName = await currentUserName(ctx)
    const run = () => runUpload(ctx, register, parsed, { dryRun, byName, fileName, hash })
    const result = dryRun
      ? await run()
      : await runPlantGuarded(ctx, req, { resourceKind: `cc_production.upload.${register.key}`, resourceId: hash, operation: 'custom', payload: { register: register.key, rows: parsed.rows.length } }, run)
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Upload',
  summary: 'Upload centre',
  methods: {
    GET: { summary: 'Registers that can be uploaded, with the last upload of each', tags: ['Creative Carbon Upload'], responses: [{ status: 200, description: 'Registers', schema: z.object({ items: z.array(z.object({ key: z.string() }).passthrough()) }) }] },
    POST: {
      summary: 'Check (dryRun) or post a register from an .xlsx / .csv file (multipart: file, register, dryRun) or from pasted rows (JSON)',
      tags: ['Creative Carbon Upload'],
      requestBody: { schema: pastedSchema },
      responses: [{ status: 200, description: 'Upload report', schema: z.object({ total: z.number(), created: z.number(), updated: z.number(), failed: z.number() }).passthrough() }],
    },
  },
}

export { GET, POST }
