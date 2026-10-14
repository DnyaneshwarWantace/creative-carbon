import { CcOrderPo } from '../data/entities'
import { openDocuments, termsOfDelivery, type PoDetails } from './poRules'
import type { OrderContext } from './server'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

async function poRow(ctx: Scope, orderId: string): Promise<CcOrderPo | null> {
  return ctx.em.findOne(CcOrderPo, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId })
}

export async function documentsStillToSend(ctx: Scope, orderId: string): Promise<Array<{ key: string; label: string }>> {
  return openDocuments((await poRow(ctx, orderId))?.documents ?? [])
}

export async function poTermsForBill(ctx: Scope, orderId: string): Promise<{ poDate: string | null; termsOfDelivery: string | null; carrier: string | null }> {
  const details: Partial<PoDetails> = (await poRow(ctx, orderId))?.details ?? {}
  return {
    poDate: details.poDate ?? null,
    termsOfDelivery: termsOfDelivery({ priceBasis: details.priceBasis ?? null, freight: details.freight ?? null, packingForwarding: details.packingForwarding ?? null, insurance: details.insurance ?? null }),
    carrier: details.carrier ?? null,
  }
}
