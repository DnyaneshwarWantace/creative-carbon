import { resolveOrderAccess, visibleStageData } from '../../../lib/visibility'
import { NextResponse } from 'next/server'
import { canSeeMoney, isMoneyStageField, withoutMoneyFields } from '../../../lib/money'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CcOrder, CcOrderLine, CcOrderStage } from '../../../data/entities'
import { loadCustomers, loadProducts, resolveOrderContext } from '../../../lib/server'
import { stageList, stageDef, stepStates } from '../../../lib/stages'
import { orderFilter } from '../../../lib/orderFilter'
import { orderListQuerySchema } from '../../../data/validators'
import { priceOrder } from '../../../lib/pricing'
import { paymentsFor, received } from '../../../../cc_accounts/lib/service'
import { loadStageOverrides, withStageOverrides } from '../../../lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
}

const querySchema = orderListQuerySchema
  .pick({ search: true, status: true, stage: true, customerId: true, productId: true })
  .extend({
    orderId: z.string().uuid().optional(),
    stageStatus: z.enum(['active', 'waiting', 'done', 'all']).default('all'),
  })

const STATUS_WORD: Record<string, string> = { waiting: 'Coming', open: 'In progress', on_hold: 'On hold', done: 'Done', skipped: 'Skipped' }

function cell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csv(rows: unknown[][]): string {
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

function day(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function days(stage: CcOrderStage | undefined): string {
  if (!stage?.openedAt) return ''
  const end = stage.completedAt ?? new Date()
  return (Math.round(((end.getTime() - stage.openedAt.getTime()) / 86400000) * 10) / 10).toString()
}

function detail(stage: CcOrderStage | undefined): { fields: Record<string, string>; steps: string } {
  const def = stage ? stageDef(stage.stageKey) : undefined
  const data = (stage?.data as Record<string, unknown>) ?? {}
  const fields: Record<string, string> = {}
  for (const field of def?.fields ?? []) {
    const value = data[field.key]
    if (value !== undefined && value !== null && value !== '') fields[field.label] = String(value)
  }
  const states = stepStates(data)
  const steps = (def?.steps ?? []).map((step) => `${step.label}: ${states[step.key]?.done ? `done${states[step.key]?.by ? ` by ${states[step.key]?.by}` : ''}${states[step.key]?.at ? ` ${day(states[step.key]?.at ?? null)}` : ''}` : 'not done'}`).join(' | ')
  return { fields, steps }
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
    const query = parsed.data
    let ids: string[]
    if (query.orderId) ids = [query.orderId]
    else {
      const { where, params } = await orderFilter(ctx, {
        ...query,
        stage: query.stageStatus === 'all' ? undefined : query.stage,
        stageStatus: query.stageStatus === 'all' ? 'active' : query.stageStatus,
      })
      const found = await ctx.em
        .getConnection()
        .execute<Array<{ id: string }>>(`select o.id from cc_orders o where ${where.join(' and ')} order by o.created_at desc limit 5000`, params)
      ids = found.map((row) => row.id)
    }
    const loaded = ids.length ? await ctx.em.find(CcOrder, { id: { $in: ids }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }) : []
    const orders = ids.map((id) => loaded.find((order) => order.id === id)).filter((order): order is CcOrder => Boolean(order))
    const [lines, stages, payments] = await Promise.all([
      ids.length ? ctx.em.find(CcOrderLine, { orderId: { $in: ids } }, { orderBy: { position: 'asc' } }) : Promise.resolve([] as CcOrderLine[]),
      ids.length ? ctx.em.find(CcOrderStage, { orderId: { $in: ids } }) : Promise.resolve([] as CcOrderStage[]),
      paymentsFor(ctx, ids),
    ])
    const [customers, products] = await Promise.all([loadCustomers(ctx, orders.map((order) => order.customerId)), loadProducts(ctx, lines.map((line) => line.productId))])
    const productText = (orderId: string) =>
      lines
        .filter((line) => line.orderId === orderId)
        .map((line) => `${products.get(line.productId)?.code ? `${products.get(line.productId)?.code} ` : ''}${products.get(line.productId)?.title ?? ''} x ${Number(line.quantity)}`)
        .join('; ')
    const pieces = (orderId: string) => lines.filter((line) => line.orderId === orderId).reduce((sum, line) => sum + Number(line.quantity), 0)
    const money = await canSeeMoney(ctx)
    const access = await resolveOrderAccess(ctx)
    const overrides = access.full ? undefined : await loadStageOverrides(ctx)
    const stageOf = (orderId: string, key: string): CcOrderStage | undefined => {
      const stage = stages.find((entry) => entry.orderId === orderId && entry.stageKey === key)
      if (!stage || (money && access.full)) return stage
      const priced = money ? ((stage.data as Record<string, unknown>) ?? {}) : withoutMoneyFields(key, (stage.data as Record<string, unknown>) ?? {})
      return Object.assign(Object.create(Object.getPrototypeOf(stage)) as CcOrderStage, stage, { data: visibleStageData(access, key, priced, overrides) })
    }
    let rows: unknown[][]
    let name: string

    if (query.orderId) {
      if (!orders[0]) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      const order = orders[0]
      name = `order-file-${order.orderNo.replace(/\//g, '-')}`
      rows = [
        ['Order', order.orderNo, 'Customer', customers.get(order.customerId)?.name ?? '', 'Status', order.status, 'Products', productText(order.id)],
        [],
        ['#', 'Stage', 'Department', 'Status', 'Opened', 'Done / skipped', 'By', 'Days', 'Responsible', 'On hold', 'Details', 'Steps'],
        ...stageList().map((def, index) => {
          const stage = stageOf(order.id, def.key)
          const info = detail(stage)
          return [
            index + 1,
            def.label,
            def.department,
            STATUS_WORD[stage?.status ?? 'waiting'],
            day(stage?.openedAt),
            day(stage?.completedAt),
            stage?.completedByName ?? '',
            days(stage),
            stage?.responsibleName ?? '',
            stage?.status === 'on_hold' ? `${stage.holdParty ?? ''}: ${stage.holdReason ?? ''}` : '',
            Object.entries(info.fields)
              .map(([label, value]) => `${label}: ${value}`)
              .join(' | '),
            info.steps,
          ]
        }),
      ]
    } else if (query.stage) {
      const base = stageDef(query.stage)!
      const def = { ...base, fields: base.fields.filter((field) => money || !isMoneyStageField(base.key, field.key)) }
      name = `${def.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${query.stageStatus}`
      rows = [
        ['Order', 'Order date', 'Delivery', 'Customer', 'Products', 'Pieces', 'Stage status', 'Opened', 'Done', 'By', 'Days', 'Responsible', 'On hold', ...def.fields.map((field) => field.label), ...def.steps.map((step) => step.label)],
        ...orders.map((order) => {
          const stage = stageOf(order.id, def.key)
          const data = (stage?.data as Record<string, unknown>) ?? {}
          const states = stepStates(data)
          return [
            order.orderNo,
            order.orderDate,
            order.deliveryDate ?? '',
            customers.get(order.customerId)?.name ?? '',
            productText(order.id),
            pieces(order.id),
            STATUS_WORD[stage?.status ?? 'waiting'],
            day(stage?.openedAt),
            day(stage?.completedAt),
            stage?.completedByName ?? '',
            days(stage),
            stage?.responsibleName ?? '',
            stage?.status === 'on_hold' ? `${stage.holdParty ?? ''}: ${stage.holdReason ?? ''}` : '',
            ...def.fields.map((field) => (data[field.key] ?? '') as string),
            ...def.steps.map((step) => (states[step.key]?.done ? `done ${day(states[step.key]?.at ?? null)}${states[step.key]?.by ? ` ${states[step.key]?.by}` : ''}` : '')),
          ]
        }),
      ]
    } else {
      name = 'order-book'
      rows = [
        ['Order', 'Order date', 'Delivery', 'Customer', 'Customer PO', 'Order status', 'Products', 'Pieces', 'Total (₹)', 'Received (₹)', 'Due (₹)', 'Now at', ...stageList().flatMap((def) => [`${def.label}: status`, `${def.label}: done on`, `${def.label}: days`])],
        ...orders.map((order) => {
          const own = lines.filter((line) => line.orderId === order.id)
          const total = priceOrder(
            own.map((line) => ({ quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) })),
            order.pricesIncludeGst,
          ).total
          const paid = received(payments.filter((payment) => payment.orderId === order.id))
          const now = stageList().filter((def) => ['open', 'on_hold'].includes(stageOf(order.id, def.key)?.status ?? '')).map((def) => def.label).join(' + ')
          return [
            order.orderNo,
            order.orderDate,
            order.deliveryDate ?? '',
            customers.get(order.customerId)?.name ?? '',
            order.customerPoRef ?? '',
            order.status,
            productText(order.id),
            pieces(order.id),
            total,
            paid,
            Math.round((total - paid) * 100) / 100,
            now,
            ...stageList().flatMap((def) => {
              const stage = stageOf(order.id, def.key)
              return [STATUS_WORD[stage?.status ?? 'waiting'], day(stage?.completedAt), days(stage)]
            }),
          ]
        }),
      ]
    }
    if (!money && !query.orderId && !query.stage) rows = rows.map((row) => [...row.slice(0, 8), ...row.slice(11)])
    return new NextResponse(csv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Export orders as CSV (Excel)',
  methods: {
    GET: {
      summary: 'Order book with every stage (default), one stage with all its fields and steps (stage=), or one order file stage by stage (orderId=)',
      tags: ['Creative Carbon Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'CSV file', schema: z.string() }],
    },
  },
}

export { GET }
