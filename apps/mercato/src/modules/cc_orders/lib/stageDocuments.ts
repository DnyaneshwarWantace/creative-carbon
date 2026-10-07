import type { OrderContext } from './server'
import { EWAY_BILL_LIMIT, documentRecordId, stageDocuments, type StageDocument, type StageOverride } from './stages'

export const STAGE_ATTACHMENT_ENTITY = 'cc_orders:order_stage'

export type DocumentStatus = StageDocument & { count: number; needed: boolean }

export async function documentCounts(ctx: OrderContext, orderId: string): Promise<Map<string, number>> {
  const rows = await ctx.em.getConnection().execute<Array<{ record_id: string; files: string | number }>>(
    `select record_id, count(*) as files from attachments
      where entity_id = ? and tenant_id = ? and organization_id = ? and record_id like ?
      group by record_id`,
    [STAGE_ATTACHMENT_ENTITY, ctx.tenantId, ctx.organizationId, `${orderId}:%`],
  )
  return new Map(rows.map((row) => [row.record_id, Number(row.files)]))
}

export function documentStatus(orderId: string, stageKey: string, counts: Map<string, number>, orderValue: number, override?: StageOverride | null): DocumentStatus[] {
  return stageDocuments(stageKey, override).map((doc) => ({
    ...doc,
    count: counts.get(documentRecordId(orderId, stageKey, doc.key)) ?? 0,
    needed: doc.required === 'always' || (doc.required === 'eway' && orderValue > EWAY_BILL_LIMIT),
  }))
}

export async function missingDocuments(ctx: OrderContext, orderId: string, stageKey: string, orderValue: number, override?: StageOverride | null): Promise<DocumentStatus[]> {
  if (!stageDocuments(stageKey, override).some((doc) => doc.required)) return []
  const counts = await documentCounts(ctx, orderId)
  return documentStatus(orderId, stageKey, counts, orderValue, override).filter((doc) => doc.needed && doc.count === 0)
}
