import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { ActivityEntry, type ActivityLink } from '../data/entities'
import { RECORD_TYPES, recordHref } from './timeline'

const logger = createLogger('cc_audit')

export type NotifyScope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null; container: { resolve: (name: string) => unknown } }

type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string | null; organizationId: string | null }) => Promise<boolean> }

const COLUMN = /^[a-z_]+$/

async function people(ctx: NotifyScope): Promise<Array<{ id: string; name: string }>> {
  const { listPeople } = await import('../../cc_orders/lib/server')
  return listPeople(ctx as unknown as Parameters<typeof listPeople>[0])
}

export async function recordOwners(ctx: NotifyScope, type: string, id: string): Promise<Set<string>> {
  const def = RECORD_TYPES[type]
  const owners = new Set<string>()
  if (!def) return owners
  const [first] = await ctx.em.find(ActivityEntry, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, recordType: type, recordId: id, actorUserId: { $ne: null } }, { orderBy: { createdAt: 'asc' }, limit: 1 })
  if (first?.actorUserId) owners.add(first.actorUserId)
  const names = new Set<string>()
  if (def.table && COLUMN.test(def.table)) {
    const makers = (def.maker ?? []).filter((column) => COLUMN.test(column))
    const columns = [...makers, ...(def.legacy === 'history' ? ['history'] : [])]
    if (columns.length) {
      const [row] = await ctx.em.getConnection().execute<Array<Record<string, unknown>>>(
        `select ${columns.join(', ')} from ${def.table} where id::text = ? and tenant_id = ? and organization_id = ? limit 1`,
        [id, ctx.tenantId, ctx.organizationId],
      )
      for (const column of makers) if (typeof row?.[column] === 'string' && (row[column] as string).trim()) names.add((row[column] as string).trim().toLowerCase())
      const history = Array.isArray(row?.history) ? (row.history as Array<{ by?: string | null }>) : []
      const creator = history.find((entry) => typeof entry?.by === 'string' && entry.by.trim())
      if (creator?.by) names.add(creator.by.trim().toLowerCase())
    }
  }
  if (names.size) for (const person of await people(ctx)) if (names.has(person.name.toLowerCase())) owners.add(person.id)
  return owners
}

function service(ctx: NotifyScope) {
  return resolveNotificationService(ctx.container)
}

export async function notifyCorrection(ctx: NotifyScope, input: { recordType: string; recordId: string; summary: string; reason: string; links?: ActivityLink[] | null; byName: string | null }): Promise<number> {
  try {
    const def = RECORD_TYPES[input.recordType]
    if (!def) return 0
    const recipients = await recordOwners(ctx, input.recordType, input.recordId)
    for (const link of input.links ?? []) {
      if (!RECORD_TYPES[link.type]) continue
      for (const owner of await recordOwners(ctx, link.type, link.id)) recipients.add(owner)
    }
    if (ctx.userId) recipients.delete(ctx.userId)
    for (const recipientUserId of recipients) {
      await service(ctx).create(
        {
          recipientUserId,
          type: 'cc_audit.record.corrected',
          title: `${def.label} corrected: ${input.summary}`,
          body: [input.byName ? `By ${input.byName}` : null, `Why: ${input.reason}`].filter(Boolean).join(' · '),
          severity: 'warning',
          sourceModule: 'cc_audit',
          sourceEntityType: `cc_audit:${input.recordType}`,
          sourceEntityId: input.recordId,
          linkHref: recordHref(input.recordType, input.recordId) ?? undefined,
        },
        { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
      )
    }
    return recipients.size
  } catch (error) {
    logger.error('Failed to send correction notification', { err: error })
    return 0
  }
}

export async function notifyMentions(ctx: NotifyScope, input: { recordType: string; recordId: string; userIds: string[]; text: string; byName: string | null }): Promise<string[]> {
  const def = RECORD_TYPES[input.recordType]
  if (!def) return []
  const rbac = ctx.container.resolve('rbacService') as RbacLike
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const sent: string[] = []
  for (const userId of new Set(input.userIds)) {
    if (userId === ctx.userId) continue
    try {
      const canSee = (await rbac.userHasAllFeatures(userId, [def.viewFeature], scope)) || (await rbac.userHasAllFeatures(userId, ['cc_audit.view'], scope))
      if (!canSee) continue
      await service(ctx).create(
        {
          recipientUserId: userId,
          type: 'cc_audit.comment.mentioned',
          title: `${input.byName ?? 'Someone'} mentioned you on a ${def.label.toLowerCase()}`,
          body: input.text.length > 240 ? `${input.text.slice(0, 237)}…` : input.text,
          severity: 'info',
          sourceModule: 'cc_audit',
          sourceEntityType: `cc_audit:${input.recordType}`,
          sourceEntityId: input.recordId,
          linkHref: recordHref(input.recordType, input.recordId) ?? undefined,
        },
        { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
      )
      sent.push(userId)
    } catch (error) {
      logger.error('Failed to send mention notification', { err: error })
    }
  }
  return sent
}
