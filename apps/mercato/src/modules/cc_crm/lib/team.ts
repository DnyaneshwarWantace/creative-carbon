import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { RoleAcl, User, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import type { StoreContext } from '../../cc_store/lib/server'
import { runCommand } from '../../cc_store/lib/server'
import { CRM_ROLE_NAMES } from '../../cc_departments/lib/seedDepartments'
import { CRM_FEATURE, ERP_FEATURE } from '../../cc_departments/lib/workspace'
import { CrmError } from './server'

export type CrmRole = keyof typeof CRM_ROLE_NAMES
type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string; organizationId: string }) => Promise<boolean> }

const CRM_ROLE_SET = new Set<string>(Object.values(CRM_ROLE_NAMES))

function crmRoleOf(roles: string[]): CrmRole | null {
  if (roles.includes(CRM_ROLE_NAMES.manager)) return 'manager'
  if (roles.includes(CRM_ROLE_NAMES.sales)) return 'sales'
  return null
}

export type TeamMember = {
  id: string
  email: string
  name: string | null
  roles: string[]
  crmRole: CrmRole | null
  crmAccess: boolean
  erpAccess: boolean
  crmOnly: boolean
  superAdmin: boolean
  lastLoginAt: string | null
  isSelf: boolean
}

async function members(ctx: StoreContext): Promise<TeamMember[]> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const users = await findWithDecryption(ctx.em, User, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }, {}, scope)
  if (!users.length) return []
  const links = await ctx.em.find(UserRole, { user: { $in: users.map((user) => user.id) }, deletedAt: null }, { populate: ['role'] })
  const superRoles = new Set((await ctx.em.find(RoleAcl, { tenantId: ctx.tenantId, isSuperAdmin: true }, { populate: ['role'] })).map((acl) => String((acl.role as { id: string }).id)))
  const rbac = ctx.container.resolve('rbacService') as RbacLike
  const result: TeamMember[] = []
  for (const user of users) {
    const own = links.filter((link) => String((link.user as { id: string }).id) === user.id)
    const roles = own.map((link) => (link.role as { name: string }).name).filter(Boolean).sort()
    const superAdmin = own.some((link) => superRoles.has(String((link.role as { id: string }).id)))
    const [crmAccess, erpAccess] = await Promise.all([rbac.userHasAllFeatures(user.id, [CRM_FEATURE], scope), rbac.userHasAllFeatures(user.id, [ERP_FEATURE], scope)])
    result.push({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      roles,
      crmRole: crmRoleOf(roles),
      crmAccess,
      erpAccess,
      crmOnly: !superAdmin && !erpAccess && roles.every((role) => CRM_ROLE_SET.has(role)),
      superAdmin,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      isSelf: user.id === ctx.userId,
    })
  }
  return result.sort((left, right) => Number(right.crmAccess) - Number(left.crmAccess) || (left.name ?? left.email).localeCompare(right.name ?? right.email))
}

export async function listTeam(ctx: StoreContext) {
  return members(ctx)
}

async function findMember(ctx: StoreContext, id: string): Promise<TeamMember> {
  const member = (await members(ctx)).find((entry) => entry.id === id)
  if (!member) throw new CrmError('Person not found', 404)
  if (member.superAdmin) throw new CrmError('Super-administrators are managed in the ERP', 403)
  return member
}

function commandError(error: unknown): never {
  const body = (error as { body?: { error?: string; details?: unknown } })?.body
  const message = body?.error ?? (error instanceof Error ? error.message : null)
  if (message && /password/i.test(message)) throw new CrmError('The password is too weak. Use at least 8 characters with a capital letter, a number and a symbol.')
  if (message && /(exists|duplicate|unique|already)/i.test(message)) throw new CrmError('Someone with this email already has a login')
  throw error
}

export async function addMember(ctx: StoreContext, input: { name: string; email: string; password: string; crmRole: CrmRole }) {
  const email = input.email.trim().toLowerCase()
  const existing = (await members(ctx)).find((member) => member.email.toLowerCase() === email)
  if (existing) throw new CrmError('Someone with this email already has a login. Give them a CRM role from the list instead.', 409)
  try {
    const created = await runCommand<{ id?: string }>(ctx, 'auth.users.create', { email, name: input.name.trim(), password: input.password, organizationId: ctx.organizationId, roles: [CRM_ROLE_NAMES[input.crmRole]] })
    return created
  } catch (error) {
    commandError(error)
  }
}

export async function setMemberRole(ctx: StoreContext, id: string, crmRole: CrmRole | null) {
  const member = await findMember(ctx, id)
  if (member.isSelf && crmRole !== 'manager') throw new CrmError('You cannot take away your own CRM manager role. Ask another CRM manager.', 409)
  const kept = member.roles.filter((role) => !CRM_ROLE_SET.has(role))
  const roles = crmRole ? [...kept, CRM_ROLE_NAMES[crmRole]] : kept
  if (!roles.length) throw new CrmError('This person would have no access at all. Remove their login in the ERP instead.', 409)
  await runCommand(ctx, 'auth.users.update', { id, roles })
  if (member.crmRole !== crmRole) {
    const label = (role: CrmRole | null) => (role === 'manager' ? 'CRM manager' : role === 'sales' ? 'Sales' : 'No CRM role')
    const { recordActivity } = await import('../../cc_audit/lib/activity')
    const { currentUserName } = await import('../../cc_orders/lib/server')
    recordActivity(ctx.em, ctx, { recordType: 'sales_person', recordId: id, action: 'role_changed', kind: 'change', changes: [{ field: 'crmRole', label: 'CRM role', from: label(member.crmRole), to: label(crmRole) }], actorUserId: ctx.userId ?? null, actorName: await currentUserName(ctx) })
    await ctx.em.flush()
  }
}

export async function resetMemberPassword(ctx: StoreContext, id: string, password: string) {
  const member = await findMember(ctx, id)
  if (!member.crmOnly) throw new CrmError('This person also uses the ERP. Their password is changed in the ERP.', 403)
  try {
    await runCommand(ctx, 'auth.users.update', { id, password })
  } catch (error) {
    commandError(error)
  }
}
