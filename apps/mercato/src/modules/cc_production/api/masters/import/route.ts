import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, hasFeatures, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { masterImportSchema } from '../../../data/validators'
import { masterDef } from '../../../lib/masterDefs'
import { importMasters } from '../../../lib/masters'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = masterImportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the master type and the rows from the sheet' }, { status: 400 })
  const def = masterDef(parsed.data.type)!
  if (!def.importable) return NextResponse.json({ error: `${def.label} cannot be imported` }, { status: 400 })
  if (!(await hasFeatures(ctx, [def.manageFeature]))) return NextResponse.json({ error: `You cannot change ${def.label.toLowerCase()}` }, { status: 403 })
  try {
    const byName = await currentUserName(ctx)
    const run = () => importMasters(ctx, def, parsed.data.rows, parsed.data.dryRun, byName)
    const result = parsed.data.dryRun
      ? await run()
      : await runPlantGuarded(ctx, req, { resourceKind: `cc_production.${def.type}`, resourceId: 'import', operation: 'custom', payload: { type: def.type, rows: parsed.data.rows.length } }, run)
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Plant',
  summary: 'Import a master from a spreadsheet',
  methods: {
    POST: {
      summary: 'Check (dryRun) or import rows from the client sheet; existing rows with the same key are updated',
      tags: ['Creative Carbon Plant'],
      requestBody: { schema: masterImportSchema },
      responses: [{ status: 200, description: 'Import report', schema: z.object({ created: z.number(), updated: z.number(), failed: z.number() }).passthrough() }],
    },
  },
}

export { POST }
