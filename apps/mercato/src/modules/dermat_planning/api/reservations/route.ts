import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { reservationActionSchema, reservationListSchema } from '../../data/validators'
import { clearReservation, moveReservation, reservationList, reserveNeeded, setReservation } from '../../lib/service'
import { planningErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_planning.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_planning.reserve'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = reservationListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json(await reservationList(ctx, parsed.data))
  } catch (error) {
    return planningErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = reservationActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the quantity, and write a reason when moving' }, { status: 400 })
  const input = parsed.data
  try {
    const resourceId = input.action === 'reserve_needed' ? input.entries[0].orderId : input.orderId
    return await runGuarded(ctx, req, { resourceKind: 'dermat_planning.reservation', resourceId, operation: 'custom', payload: input }, async () => {
      if (input.action === 'reserve_needed') {
        const results = await ctx.em.transactional(async (em) => reserveNeeded({ ...ctx, em: em as typeof ctx.em }, input.entries))
        return NextResponse.json({ ok: true, results })
      }
      await ctx.em.transactional(async (em) => {
        const tx = { ...ctx, em: em as typeof ctx.em }
        if (input.action === 'reserve') await setReservation(tx, input.orderId, input.productId, input.quantity, input.note ?? null)
        if (input.action === 'clear') await clearReservation(tx, input.orderId, input.productId, input.note ?? null)
        if (input.action === 'move') await moveReservation(tx, input.orderId, input.toOrderId, input.productId, input.quantity, input.note)
      })
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Stock reservations per order',
  methods: {
    GET: {
      summary: 'Active reservations (by order or material) with the reservation history',
      tags: ['Dermat Planning'],
      query: reservationListSchema,
      responses: [{ status: 200, description: 'Reservations', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()), history: z.array(z.object({ id: z.string() }).passthrough()) }) }],
    },
    POST: {
      summary: 'Reserve (set total), clear, move to another order, or reserve what is needed for several orders. Stock is never deducted.',
      tags: ['Dermat Planning'],
      requestBody: { schema: reservationActionSchema },
      responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }).passthrough() }],
      errors: [{ status: 409, description: 'Not enough free stock, or the order is closed' }],
    },
  },
}

export { GET, POST }
