import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { LOGO_DATA_URL, MAX_LOGO_CHARS, findPartyLogo, removePartyLogo, savePartyLogo } from '../../lib/partyLogos'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true },
  PUT: { requireAuth: true, requireFeatures: ['cc_accounts.logos'] },
  DELETE: { requireAuth: true, requireFeatures: ['cc_accounts.logos'] },
}

const partySchema = z.object({ kind: z.enum(['customer', 'vendor']), id: z.string().uuid() })
const writeSchema = partySchema.extend({ imageUrl: z.string().max(MAX_LOGO_CHARS).regex(LOGO_DATA_URL, 'Send a PNG, JPG or WebP image') })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = partySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which customer or vendor' }, { status: 400 })
  const row = await findPartyLogo(ctx, parsed.data.kind, parsed.data.id)
  return NextResponse.json({ imageUrl: row?.imageUrl ?? null, updatedAt: row?.updatedAt.toISOString() ?? null })
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = writeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Send the party and a PNG, JPG or WebP logo under 500 KB' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runGuarded(ctx, req, parsed.data.id, { kind: parsed.data.kind }, async () => {
      const row = await savePartyLogo(ctx, parsed.data.kind, parsed.data.id, parsed.data.imageUrl, byName)
      return { imageUrl: row.imageUrl, updatedAt: row.updatedAt.toISOString() }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = partySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which customer or vendor' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, parsed.data.id, { kind: parsed.data.kind }, async () => ({ removed: await removePartyLogo(ctx, parsed.data.kind, parsed.data.id) }))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Logo of a customer or supplier, printed in their block on our documents',
  methods: {
    GET: { summary: 'Read a party logo', tags: ['Creative Carbon Accounts'], query: partySchema, responses: [{ status: 200, description: 'Logo data URL or null', schema: z.object({ imageUrl: z.string().nullable() }).passthrough() }] },
    PUT: { summary: 'Set or replace a party logo', tags: ['Creative Carbon Accounts'], requestBody: { schema: writeSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ imageUrl: z.string() }).passthrough() }] },
    DELETE: { summary: 'Remove a party logo', tags: ['Creative Carbon Accounts'], query: partySchema, responses: [{ status: 200, description: 'Removed', schema: z.object({ removed: z.boolean() }) }] },
  },
}

export { GET, PUT, DELETE }
