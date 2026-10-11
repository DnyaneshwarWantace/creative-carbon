import { createHash } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getModules } from '@open-mercato/shared/lib/i18n/server'
import { AccessChange, AccessSnapshot, type AccessState, type AccessSubject } from '../data/entities'

type Scope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

export const ACCESS_UNDO_DAYS = 7

export class AccessLogError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

let featureTitles: Map<string, string> | null = null

function titleOf(feature: string): string {
  if (!featureTitles) {
    featureTitles = new Map()
    for (const registered of (getModules() ?? []) as Array<{ features?: Array<{ id: string; title?: string }> }>) {
      for (const entry of registered.features ?? []) featureTitles.set(String(entry.id), String(entry.title ?? entry.id))
    }
  }
  return featureTitles.get(feature) ?? feature
}

function sorted(values: unknown): string[] {
  return Array.isArray(values) ? [...new Set(values.map(String))].sort() : []
}

export async function readAccess(scope: Scope, subjectType: AccessSubject, subjectId: string): Promise<AccessState> {
  const connection = scope.em.getConnection()
  if (subjectType === 'role') {
    const [role] = await connection.execute<Array<{ name: string }>>('select name from roles where id = ? and deleted_at is null', [subjectId])
    const [acl] = await connection.execute<Array<{ features_json: unknown; is_super_admin: boolean }>>('select features_json, is_super_admin from role_acls where role_id = ? and tenant_id = ? and deleted_at is null limit 1', [subjectId, scope.tenantId])
    return { exists: Boolean(role), label: role?.name ?? 'Role', superAdmin: Boolean(acl?.is_super_admin), features: sorted(acl?.features_json) }
  }
  const [user] = await connection.execute<Array<{ name: string | null; email: string; password_hash: string | null }>>('select name, email, password_hash from users where id = ? and tenant_id = ? and deleted_at is null', [subjectId, scope.tenantId])
  const roles = await connection.execute<Array<{ name: string }>>('select r.name from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ? and ur.deleted_at is null and r.deleted_at is null', [subjectId])
  const [acl] = await connection.execute<Array<{ features_json: unknown; is_super_admin: boolean }>>('select features_json, is_super_admin from user_acls where user_id = ? and tenant_id = ? and deleted_at is null limit 1', [subjectId, scope.tenantId])
  return {
    exists: Boolean(user),
    label: user ? (user.name?.trim() || user.email) : 'Person',
    superAdmin: Boolean(acl?.is_super_admin),
    features: acl ? sorted(acl.features_json) : null,
    roles: roles.map((row) => row.name).sort(),
    password: user?.password_hash ? createHash('sha256').update(user.password_hash).digest('hex').slice(0, 16) : null,
  }
}

function diffStates(subjectType: AccessSubject, before: AccessState | null, after: AccessState): AccessChange['changes'] {
  const changes: AccessChange['changes'] = []
  if (subjectType === 'user' && !before?.exists && after.exists) changes.push({ field: 'exists', label: 'Person', from: null, to: 'added' })
  if (subjectType === 'user' && before?.exists && !after.exists) changes.push({ field: 'exists', label: 'Person', from: 'present', to: 'removed' })
  if ((before?.superAdmin ?? false) !== after.superAdmin) changes.push({ field: 'superAdmin', label: 'Full access (super admin)', from: before?.superAdmin ?? false, to: after.superAdmin })
  const beforeFeatures = new Set(before?.features ?? [])
  const afterFeatures = new Set(after.features ?? [])
  for (const feature of afterFeatures) if (!beforeFeatures.has(feature)) changes.push({ field: `feature:${feature}`, label: titleOf(feature), from: 'No', to: 'Yes' })
  for (const feature of beforeFeatures) if (!afterFeatures.has(feature)) changes.push({ field: `feature:${feature}`, label: titleOf(feature), from: 'Yes', to: 'No' })
  if ((before?.features === null) !== (after.features === null) && before) changes.push({ field: 'personal', label: 'Own rights (instead of the department)', from: before.features === null ? 'No' : 'Yes', to: after.features === null ? 'No' : 'Yes' })
  const beforeRoles = new Set(before?.roles ?? [])
  const afterRoles = new Set(after.roles ?? [])
  for (const role of afterRoles) if (!beforeRoles.has(role)) changes.push({ field: `role:${role}`, label: `Department ${role}`, from: 'No', to: 'Yes' })
  for (const role of beforeRoles) if (!afterRoles.has(role)) changes.push({ field: `role:${role}`, label: `Department ${role}`, from: 'Yes', to: 'No' })
  if (before?.exists && after.exists && before.password && after.password && before.password !== after.password) changes.push({ field: 'password', label: 'Password', from: 'old', to: 'reset' })
  return changes
}

function actionFor(changes: AccessChange['changes']): string {
  if (changes.some((change) => change.field === 'exists' && change.to === 'added')) return 'person_added'
  if (changes.some((change) => change.field === 'exists' && change.to === 'removed')) return 'person_removed'
  const features = changes.filter((change) => change.field.startsWith('feature:') || change.field === 'superAdmin')
  if (features.length && features.every((change) => change.to === 'Yes' || change.to === true)) return 'right_granted'
  if (features.length && features.every((change) => change.to === 'No' || change.to === false)) return 'right_removed'
  if (features.length) return 'rights_changed'
  if (changes.some((change) => change.field.startsWith('role:'))) return 'department_changed'
  if (changes.some((change) => change.field === 'password')) return 'password_reset'
  return 'changed'
}

async function actorName(scope: Scope): Promise<string | null> {
  if (!scope.userId) return null
  const { userNames } = await import('../../cc_orders/lib/server')
  return (await userNames(scope as Parameters<typeof userNames>[0], [scope.userId])).get(scope.userId) ?? null
}

export async function syncAccess(scope: Scope, input: { subjectType: AccessSubject; subjectId: string; phase: 'before' | 'after'; reason?: string | null; undoOf?: string | null; initial?: AccessState | null }): Promise<AccessChange | null> {
  const current = await readAccess(scope, input.subjectType, input.subjectId)
  let snapshot = await scope.em.findOne(AccessSnapshot, { tenantId: scope.tenantId, subjectType: input.subjectType, subjectId: input.subjectId })
  const previous = snapshot ? snapshot.state : input.initial === undefined ? null : input.initial
  if (!snapshot && input.phase === 'before' && input.initial === undefined) {
    snapshot = scope.em.create(AccessSnapshot, { tenantId: scope.tenantId, subjectType: input.subjectType, subjectId: input.subjectId, state: current })
    scope.em.persist(snapshot)
    await scope.em.flush()
    return null
  }
  const changes = diffStates(input.subjectType, previous, current)
  let undone: AccessChange | null = null
  if (input.undoOf) {
    undone = await scope.em.findOne(AccessChange, { id: input.undoOf, tenantId: scope.tenantId, subjectType: input.subjectType, subjectId: input.subjectId })
    if (!undone) throw new AccessLogError('The change to undo was not found', 404)
  }
  if (snapshot) snapshot.state = current
  else {
    snapshot = scope.em.create(AccessSnapshot, { tenantId: scope.tenantId, subjectType: input.subjectType, subjectId: input.subjectId, state: current })
    scope.em.persist(snapshot)
  }
  if (!changes.length) {
    await scope.em.flush()
    return null
  }
  const name = await actorName(scope)
  const outside = input.phase === 'before'
  const action = undone ? 'undone' : outside ? 'changed_elsewhere' : actionFor(changes)
  const change = scope.em.create(AccessChange, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectLabel: current.label,
    action,
    before: previous,
    after: current,
    changes,
    reason: input.reason?.trim() || null,
    outside,
    actorUserId: outside ? null : scope.userId ?? null,
    actorName: outside ? null : name,
    undoOf: undone?.id ?? null,
  })
  scope.em.persist(change)
  if (undone) {
    undone.undoneAt = new Date()
    undone.undoneByName = name
  }
  await scope.em.flush()
  const { recordActivity } = await import('../../cc_audit/lib/activity')
  recordActivity(scope.em, scope, {
    recordType: input.subjectType === 'role' ? 'access_role' : 'access_user',
    recordId: input.subjectId,
    action,
    kind: undone || input.reason ? 'correction' : 'change',
    summary: outside ? 'Changed outside the access page; found on the next visit' : `${current.label}: ${changes.length} change${changes.length === 1 ? '' : 's'}`,
    reason: input.reason?.trim() || null,
    changes,
    actorUserId: outside ? null : scope.userId ?? null,
    actorName: outside ? null : name,
  })
  await scope.em.flush()
  return change
}

export function accessChangeView(change: AccessChange) {
  return {
    id: change.id,
    subjectType: change.subjectType,
    subjectId: change.subjectId,
    subjectLabel: change.subjectLabel,
    action: change.action,
    changes: change.changes,
    reason: change.reason ?? null,
    outside: change.outside,
    by: change.actorName ?? null,
    at: change.createdAt.toISOString(),
    undoOf: change.undoOf ?? null,
    undoneAt: change.undoneAt ? change.undoneAt.toISOString() : null,
    undoneByName: change.undoneByName ?? null,
    canUndo: !change.undoneAt && !change.undoOf && change.action !== 'person_added' && change.action !== 'person_removed' && change.action !== 'password_reset' && Date.now() - change.createdAt.getTime() < ACCESS_UNDO_DAYS * 86_400_000,
    restore: change.before ? { superAdmin: change.before.superAdmin, features: change.before.features, roles: change.before.roles ?? null } : null,
  }
}

export async function listAccessChanges(scope: Scope, filter: { subjectType?: AccessSubject; subjectId?: string }) {
  const rows = await scope.em.find(AccessChange, { tenantId: scope.tenantId, ...(filter.subjectType ? { subjectType: filter.subjectType } : {}), ...(filter.subjectId ? { subjectId: filter.subjectId } : {}) }, { orderBy: { createdAt: 'desc' }, limit: 200 })
  return rows.map(accessChangeView)
}
