import type { EntityManager } from '@mikro-orm/postgresql'
import { CcOrder, CcOrderLine, CcOrderStage } from '../data/entities'
import type { OrderInput } from '../data/validators'
import { createStages, logEvent, openReadyStages } from './engine'
import { OrderError, customerExists, loadProducts, nextOrderNo, type OrderContext } from './server'
import { notifyStagesOpened } from './notify'

export function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function cleanSpecs(specs: OrderInput['lines'][number]['specs']): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const [section, values] of Object.entries(specs ?? {})) {
    const kept = Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value.trim()))
    if (Object.keys(kept).length) result[section] = kept
  }
  return result
}

export async function validateInput(ctx: OrderContext, input: OrderInput): Promise<void> {
  if (!(await customerExists(ctx, input.customerId))) throw new OrderError('Customer not found', 404)
  const products = await loadProducts(
    ctx,
    input.lines.map((line) => line.productId),
  )
  const rows: Record<string, string> = {}
  input.lines.forEach((line, index) => {
    const product = products.get(line.productId)
    if (!product) rows[String(index + 1)] = 'Product not found'
  })
  if (Object.keys(rows).length) throw new OrderError('Some lines need fixing', 400, { rows })
  if (input.deliveryDate && input.deliveryDate < input.orderDate) throw new OrderError('Delivery date is before the order date')
}

export function applyHeader(order: CcOrder, input: OrderInput) {
  order.orderDate = input.orderDate
  order.deliveryDate = input.deliveryDate ?? null
  order.customerId = input.customerId
  order.customerPoRef = clean(input.customerPoRef)
  order.orderType = input.orderType
  order.sourceOrderId = input.sourceOrderId ?? null
  order.salesManager = clean(input.salesManager)
  order.paymentTerms = clean(input.paymentTerms)
  order.market = input.market
  order.incoterm = input.market === 'export' ? clean(input.incoterm) : null
  order.portOfLoading = input.market === 'export' ? clean(input.portOfLoading) : null
  order.country = input.market === 'export' ? clean(input.country) : null
  order.currency = input.market === 'export' ? clean(input.currency) : 'INR'
  order.paymentRemarks = clean(input.paymentRemarks)
  order.productRemarks = clean(input.productRemarks)
  order.billingRemarks = clean(input.billingRemarks)
  order.packingRemarks = clean(input.packingRemarks)
  order.pricesIncludeGst = input.pricesIncludeGst
  order.priority = input.priority
  order.billingAddress = clean(input.billingAddress)
  order.shippingAddress = clean(input.shippingAddress)
}

export async function writeLines(ctx: OrderContext, order: CcOrder, input: OrderInput) {
  input.lines.forEach((line, index) => {
    ctx.em.persist(
      ctx.em.create(CcOrderLine, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        orderId: order.id,
        position: index + 1,
        productId: line.productId,
        brandName: clean(line.brandName),
        packSize: clean(line.packSize),
        mrp: line.mrp == null ? null : String(line.mrp),
        quantity: String(line.quantity),
        rate: line.rate == null ? null : String(line.rate),
        gstPercent: String(line.gstPercent),
        discountPercent: String(line.discountPercent),
        batchNo: clean(line.batchNo),
        sampleNeeded: line.sampleNeeded,
        rdNumber: clean(line.rdNumber),
        specs: cleanSpecs(line.specs),
      }),
    )
  })
}

export async function createOrderRecord(ctx: OrderContext, input: OrderInput, byName: string | null, note: string | null = null): Promise<CcOrder> {
  await validateInput(ctx, input)
  const order = await ctx.em.transactional(async (em) => {
    const txCtx = { ...ctx, em: em as EntityManager }
    const created = em.create(CcOrder, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderNo: await nextOrderNo(txCtx, input.orderDate),
      orderDate: input.orderDate,
      customerId: input.customerId,
      createdByName: byName,
    })
    applyHeader(created, input)
    em.persist(created)
    await em.flush()
    await writeLines(txCtx, created, input)
    const stages = createStages(txCtx, created, byName)
    logEvent(txCtx, created, 'created', 'order', note ?? (created.orderType === 'repeat' ? 'Repeat order' : null), byName)
    for (const opened of openReadyStages(stages)) logEvent(txCtx, created, 'opened', opened, null, null)
    await em.flush()
    return created
  })
  const openedNow = (await ctx.em.fork().find(CcOrderStage, { orderId: order.id, status: 'open' })).map((stage) => stage.stageKey)
  await notifyStagesOpened(ctx, order, openedNow)
  return order
}
