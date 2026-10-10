import type { EntityManager } from '@mikro-orm/postgresql'
import { ActivityEntry, type ActivityChange, type ActivityKind, type ActivityLink, type ActivitySource } from '../data/entities'

type Scope = { tenantId: string; organizationId: string }

export type ActivityInput = {
  recordType: string
  recordId: string
  action: string
  kind?: ActivityKind
  summary?: string | null
  reason?: string | null
  changes?: ActivityChange[] | null
  links?: ActivityLink[] | null
  source?: ActivitySource
  actorUserId?: string | null
  actorName?: string | null
}

export type FieldSpec = { label: string; money?: boolean; format?: (value: unknown) => string | number | boolean | null }

function plain(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function same(a: unknown, b: unknown): boolean {
  const left = plain(a)
  const right = plain(b)
  if (typeof left === 'number' || typeof right === 'number') return Number(left ?? 0) === Number(right ?? 0) && (left === null) === (right === null)
  return left === right
}

export function diffFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, fields: Record<string, FieldSpec>): ActivityChange[] {
  const changes: ActivityChange[] = []
  for (const [field, spec] of Object.entries(fields)) {
    if (!(field in after)) continue
    const from = before ? before[field] : undefined
    const to = after[field]
    if (before && same(from, to)) continue
    if (!before && plain(to) === null) continue
    const format = spec.format ?? plain
    changes.push({ field, label: spec.label, from: before ? format(from) : null, to: format(to), ...(spec.money ? { money: true } : {}) })
  }
  return changes
}

export function recordActivity(em: EntityManager, scope: Scope, input: ActivityInput): ActivityEntry {
  const entry = em.create(ActivityEntry, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    recordType: input.recordType,
    recordId: input.recordId,
    action: input.action,
    kind: input.kind ?? 'change',
    summary: input.summary ?? null,
    reason: input.reason ?? null,
    changes: input.changes?.length ? input.changes : null,
    links: input.links?.length ? input.links : null,
    source: input.source ?? 'screen',
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
  })
  em.persist(entry)
  return entry
}

type CorrectionScope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

export const REASON_MIN = 3

export async function logCorrection(ctx: CorrectionScope, input: { recordType: string; recordId: string; action: string; summary: string; reason: string; links?: ActivityLink[] }) {
  const { userNames } = await import('../../cc_orders/lib/server')
  const name = ctx.userId ? ((await userNames(ctx as Parameters<typeof userNames>[0], [ctx.userId])).get(ctx.userId) ?? null) : null
  recordActivity(ctx.em, ctx, { recordType: input.recordType, recordId: input.recordId, action: input.action, kind: 'correction', summary: input.summary, reason: input.reason, links: input.links ?? null, actorUserId: ctx.userId ?? null, actorName: name })
  await ctx.em.flush()
}
