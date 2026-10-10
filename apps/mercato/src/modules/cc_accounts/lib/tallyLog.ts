import type { EntityManager } from '@mikro-orm/postgresql'
import { recordActivity } from '../../cc_audit/lib/activity'
import type { TallyPush, TallyPushAttempt } from '../data/entities'

type Scope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

export const TALLY_RECORD_TYPE: Record<string, string> = { Sales: 'invoice', 'Credit Note': 'invoice', Receipt: 'payment', Purchase: 'vendor_bill', Payment: 'vendor_bill', 'Debit Note': 'debit_note' }

const RESULT: Record<string, string> = { sent: 'accepted by Tally', partial: 'partly accepted by Tally', failed: 'refused or not reached' }

export function logPushOnDocuments(ctx: Scope, push: TallyPush, attempt: TallyPushAttempt, retry: boolean) {
  const verb = retry ? 'Re-sent' : 'Sent'
  const problem = attempt.error ?? attempt.lineErrors[0] ?? null
  const action = attempt.status === 'failed' ? 'tally_failed' : 'tally_pushed'
  const link = { type: 'tally_push', id: push.id, label: push.code }
  const seen = new Set<string>()
  for (const doc of push.documents) {
    const recordType = TALLY_RECORD_TYPE[doc.type]
    if (!doc.recordId || !recordType || seen.has(`${recordType}:${doc.recordId}:${doc.type}`)) continue
    seen.add(`${recordType}:${doc.recordId}:${doc.type}`)
    recordActivity(ctx.em, ctx, {
      recordType,
      recordId: doc.recordId,
      action,
      kind: 'system',
      summary: `${verb} to Tally in ${push.code} (${doc.type} ${doc.number}): ${RESULT[attempt.status] ?? attempt.status}${problem && attempt.status !== 'sent' ? ` · ${problem}` : ''}`,
      links: [link],
      source: 'job',
      actorUserId: ctx.userId ?? null,
      actorName: attempt.by,
    })
  }
  recordActivity(ctx.em, ctx, {
    recordType: 'tally_push',
    recordId: push.id,
    action: retry ? 'resent' : 'sent',
    kind: 'stage',
    summary: `${verb}: ${push.documents.length} entries, ${attempt.created} created, ${attempt.altered} altered, ${attempt.errors} errors · ${RESULT[attempt.status] ?? attempt.status}`,
    reason: problem,
    actorUserId: ctx.userId ?? null,
    actorName: attempt.by,
  })
}

export async function tallyPushOf(ctx: Scope, recordId: string, types?: string[]): Promise<string | null> {
  const [row] = await ctx.em.getConnection().execute<Array<{ code: string }>>(
    `select p.code from cc_tally_pushes p, jsonb_array_elements(p.documents) d
      where p.tenant_id = ? and p.organization_id = ? and p.status in ('sent', 'partial', 'manual') and d->>'recordId' = ?
        ${types?.length ? `and d->>'type' = any(?::text[])` : ''}
      order by p.created_at desc limit 1`,
    [ctx.tenantId, ctx.organizationId, recordId, ...(types?.length ? [`{${types.map((type) => `"${type}"`).join(',')}}`] : [])],
  )
  return row?.code ?? null
}
