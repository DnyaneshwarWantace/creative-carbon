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

const SKIP_KEYS = new Set(['id', 'history', 'updatedAt', 'createdAt', 'deletedAt', 'warnings', 'updatedByName', 'byName', 'tenantId', 'organizationId'])
const MAX_CHANGES = 60

function humanLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function flatten(value: unknown, path: string, label: string, out: Map<string, { label: string; value: string | number | boolean | null }>) {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) {
      out.set(path, { label, value: value.length ? value.map((item) => plain(item)).join(', ') : null })
      return
    }
    value.forEach((item, index) => flatten(item, `${path}[${index}]`, `${label} ${index + 1}`, out))
    return
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(key) || /Id$/.test(key) || key.endsWith('Ids')) continue
      flatten(inner, path ? `${path}.${key}` : key, label ? `${label} · ${humanLabel(key)}` : humanLabel(key), out)
    }
    return
  }
  out.set(path, { label, value: typeof value === 'string' && /^-?(?:0|[1-9]\d{0,7}|(?:0|[1-9]\d{0,9})\.\d+)$/.test(value) ? Number(value) : plain(value) })
}

export function diffSnapshot(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string> = {}): ActivityChange[] {
  const left = new Map<string, { label: string; value: string | number | boolean | null }>()
  const right = new Map<string, { label: string; value: string | number | boolean | null }>()
  for (const [key, value] of Object.entries(before)) if (!SKIP_KEYS.has(key)) flatten(value, key, labels[key] ?? humanLabel(key), left)
  for (const [key, value] of Object.entries(after)) if (!SKIP_KEYS.has(key)) flatten(value, key, labels[key] ?? humanLabel(key), right)
  const changes: ActivityChange[] = []
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    const from = left.get(path)
    const to = right.get(path)
    if (same(from?.value ?? null, to?.value ?? null)) continue
    changes.push({ field: path, label: (to ?? from)!.label, from: from?.value ?? null, to: to?.value ?? null })
    if (changes.length >= MAX_CHANGES) break
  }
  return changes
}

export function snapshot<T extends object>(row: T, keys: Array<keyof T>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(Object.fromEntries(keys.map((key) => [key, row[key] ?? null])))) as Record<string, unknown>
}

export function logEdit(em: EntityManager, scope: Scope & { userId?: string | null }, input: { recordType: string; recordId: string; before: Record<string, unknown>; after: Record<string, unknown>; byName: string | null; labels?: Record<string, string>; action?: string }) {
  const changes = diffSnapshot(input.before, input.after, input.labels)
  if (!changes.length) return null
  return recordActivity(em, scope, { recordType: input.recordType, recordId: input.recordId, action: input.action ?? 'edited', kind: 'change', summary: `${changes.length} field${changes.length === 1 ? '' : 's'} changed`, changes, actorUserId: scope.userId ?? null, actorName: input.byName })
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

type CorrectionScope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null; container?: { resolve: (name: string) => unknown } }

export const REASON_MIN = 3

export async function logCorrection(ctx: CorrectionScope, input: { recordType: string; recordId: string; action: string; summary: string; reason: string; links?: ActivityLink[]; changes?: ActivityChange[] }) {
  const { userNames } = await import('../../cc_orders/lib/server')
  const name = ctx.userId ? ((await userNames(ctx as Parameters<typeof userNames>[0], [ctx.userId])).get(ctx.userId) ?? null) : null
  recordActivity(ctx.em, ctx, { recordType: input.recordType, recordId: input.recordId, action: input.action, kind: 'correction', summary: input.summary, reason: input.reason, links: input.links ?? null, changes: input.changes ?? null, actorUserId: ctx.userId ?? null, actorName: name })
  await ctx.em.flush()
  if (ctx.container) {
    const { notifyCorrection } = await import('./notify')
    await notifyCorrection({ ...ctx, container: ctx.container }, { ...input, byName: name })
  }
}
