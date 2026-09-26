import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { DermatOrderLine, DermatOrderStage } from '../../../data/entities'
import { logEvent } from '../../../lib/engine'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { OrderError, currentUserName, findOrder, resolveOrderContext } from '../../../lib/server'
import { LINE_SPEC_SECTIONS } from '../../../lib/specs'
import { isFinished } from '../../../lib/stages'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_orders.manage'] },
}

const ORDER_FIELDS = {
  orderType: { label: 'Order type', max: 20, choices: ['new', 'repeat', 'revision'] },
  customerPoRef: { label: 'Customer PO', max: 120 },
  salesManager: { label: 'Sales POC', max: 120 },
  deliveryDate: { label: 'Delivery date', max: 10, date: true },
  paymentTerms: { label: 'Payment terms', max: 120 },
  paymentRemarks: { label: 'Payment remarks', max: 200 },
  productRemarks: { label: 'Product remarks', max: 2000 },
  billingRemarks: { label: 'Billing remarks', max: 2000 },
  packingRemarks: { label: 'Packing remarks', max: 2000 },
} as const

const LINE_FIELDS = {
  brandName: { label: 'Brand name', kind: 'text', max: 200 },
  packSize: { label: 'Pack size', kind: 'text', max: 60 },
  batchNo: { label: 'Batch no.', kind: 'text', max: 60 },
  mrp: { label: 'MRP', kind: 'number', min: 0, maxValue: 10_000_000 },
  rate: { label: 'Rate', kind: 'number', min: 0, maxValue: 10_000_000 },
  gstPercent: { label: 'GST %', kind: 'number', min: 0, maxValue: 28, choices: [0, 5, 12, 18, 28] },
  discountPercent: { label: 'Discount %', kind: 'number', min: 0, maxValue: 100 },
  quantity: { label: 'Quantity', kind: 'number', min: 1, maxValue: 100_000_000 },
} as const

const cellSchema = z.object({
  orderId: z.string().uuid(),
  target: z.enum(['order', 'line', 'spec']),
  lineId: z.string().uuid().optional(),
  section: z.enum(['production', 'primary', 'secondary']).optional(),
  field: z.string().min(1).max(60),
  value: z.union([z.string().max(2000), z.number(), z.null()]),
})

function text(value: string | number | null): string | null {
  if (value === null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = cellSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cell', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    const order = await findOrder(ctx, input.orderId)
    if (order.status === 'cancelled' || order.status === 'completed') throw new OrderError('This order is closed and can no longer be changed', 409)
    enforceOrderLock(order, req)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'update', payload: input }, async () => {
      const byName = await currentUserName(ctx)
      const result = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const fresh = await findOrder(txCtx, order.id)
        let label: string
        let shown: string
        if (input.target === 'order') {
          const def = ORDER_FIELDS[input.field as keyof typeof ORDER_FIELDS]
          if (!def) throw new OrderError('This field cannot be edited here')
          const value = text(input.value)
          if (value && value.length > def.max) throw new OrderError(`${def.label} is too long`)
          if ('choices' in def && (!value || !(def.choices as readonly string[]).includes(value))) throw new OrderError(`Pick a ${def.label.toLowerCase()} from the list`)
          if ('date' in def && value) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new OrderError('Enter the date as YYYY-MM-DD')
            if (value < fresh.orderDate) throw new OrderError('Delivery date is before the order date')
          }
          ;(fresh as unknown as Record<string, string | null>)[input.field] = value
          label = def.label
          shown = value ?? '(empty)'
        } else {
          if (!input.lineId) throw new OrderError('Pick the product line')
          const line = await em.findOne(DermatOrderLine, { id: input.lineId, orderId: fresh.id })
          if (!line) throw new OrderError('That product line is not on this order', 404)
          if (input.target === 'line') {
            const def = LINE_FIELDS[input.field as keyof typeof LINE_FIELDS]
            if (!def) throw new OrderError('This field cannot be edited here')
            if (input.field === 'quantity') {
              const stages = await em.find(DermatOrderStage, { orderId: fresh.id })
              if (stages.some((stage) => stage.stageKey === 'manufacturing' && isFinished(stage.status))) throw new OrderError('Manufacturing is done — quantities are locked', 409)
            }
            if (def.kind === 'number') {
              const raw = text(input.value)
              if (raw === null) {
                if (input.field === 'quantity' || input.field === 'gstPercent' || input.field === 'discountPercent') throw new OrderError(`${def.label} cannot be empty`)
                ;(line as unknown as Record<string, string | null>)[input.field] = null
                shown = '(empty)'
              } else {
                const number = Number(raw)
                if (!Number.isFinite(number) || number < def.min || number > def.maxValue) throw new OrderError(`${def.label} must be a number from ${def.min} to ${def.maxValue}`)
                if ('choices' in def && !(def.choices as readonly number[]).includes(number)) throw new OrderError(`${def.label} must be one of ${def.choices.join(', ')}`)
                ;(line as unknown as Record<string, string | null>)[input.field] = String(number)
                shown = String(number)
              }
            } else {
              const value = text(input.value)
              if (value && value.length > def.max) throw new OrderError(`${def.label} is too long`)
              ;(line as unknown as Record<string, string | null>)[input.field] = value
              shown = value ?? '(empty)'
            }
            label = def.label
          } else {
            const section = LINE_SPEC_SECTIONS.find((entry) => entry.key === input.section)
            const spec = section?.fields.find((entry) => entry.key === input.field)
            if (!section || !spec) throw new OrderError('Unknown specification')
            const value = text(input.value)
            if (value && value.length > 500) throw new OrderError(`${spec.label} is too long`)
            const specs = { ...(line.specs ?? {}) }
            const current = { ...(specs[section.key] ?? {}) }
            if (value) current[spec.key] = value
            else delete current[spec.key]
            specs[section.key] = current
            line.specs = specs
            label = spec.label
            shown = value ?? '(empty)'
          }
          line.updatedAt = new Date()
        }
        fresh.updatedAt = new Date()
        logEvent(txCtx, fresh, 'edited', null, `${label}: ${shown}`, byName)
        await em.flush()
        return { ok: true, updatedAt: fresh.updatedAt.toISOString() }
      })
      return NextResponse.json(result)
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Edit one cell of the order book',
  methods: {
    POST: {
      summary: 'Change one order header field, one product-line field or one line specification (inline edit in the order book)',
      tags: ['Dermat Orders'],
      requestBody: { contentType: 'application/json', schema: cellSchema },
      responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean(), updatedAt: z.string() }) }],
      errors: [
        { status: 400, description: 'Invalid value' },
        { status: 409, description: 'Closed order, locked quantity, or changed by someone else' },
      ],
    },
  },
}

export { POST }
