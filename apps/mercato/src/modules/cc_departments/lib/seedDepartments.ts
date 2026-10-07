import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Role, RoleAcl } from '@open-mercato/core/modules/auth/data/entities'
import { Department, type DepartmentType } from '../data/entities'

export type DepartmentSeedScope = { tenantId: string; organizationId: string }

export type DepartmentSeed = { name: string; type: DepartmentType; features: string[] }

const EVERYONE = ['cc_dashboard.my_work', 'perspectives.use', 'cc_departments.view']

export const CC_DEPARTMENTS: DepartmentSeed[] = [
  {
    name: 'Management',
    type: 'admin',
    features: [
      'cc_dashboard.*',
      'cc_orders.*',
      'cc_production.*',
      'cc_store.*',
      'cc_purchase.*',
      'cc_accounts.*',
      'cc_vendors.*',
      'cc_lists.*',
      'cc_departments.*',
      'customers.companies.view',
      'customers.companies.manage',
      'catalog.products.view',
      'catalog.products.manage',
      'attachments.view',
      'attachments.manage',
    ],
  },
  {
    name: 'Floor supervisor',
    type: 'production',
    features: [
      'cc_dashboard.view',
      'cc_dashboard.everyone',
      'cc_production.masters.view',
      'cc_production.masters.manage',
      'cc_production.upload.use',
      'cc_production.resin.view',
      'cc_production.resin.enter',
      'cc_production.resin.sign',
      'cc_production.chemicals.issue',
      'cc_orders.view',
      'cc_orders.full',
      'cc_orders.stages',
      'cc_store.view',
      'cc_purchase.view',
      'catalog.products.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
  { name: 'Resin plant', type: 'production', features: ['cc_production.masters.view', 'cc_production.resin.view', 'cc_production.resin.enter', 'cc_production.resin.sign', 'cc_production.chemicals.issue', 'attachments.view'] },
  { name: 'Coating', type: 'production', features: ['cc_production.masters.view', 'cc_production.resin.view', 'cc_production.chemicals.issue', 'attachments.view'] },
  { name: 'Press & moulding', type: 'production', features: ['cc_production.masters.view', 'attachments.view'] },
  {
    name: 'Store & despatch',
    type: 'store',
    features: [
      'cc_store.view',
      'cc_store.adjust',
      'cc_production.resin.view',
      'cc_production.chemicals.issue',
      'cc_orders.view',
      'cc_orders.stages',
      'cc_orders.work.store',
      'cc_orders.work.dispatch',
      'cc_purchase.view',
      'cc_purchase.receive',
      'catalog.products.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
  {
    name: 'QC & lab',
    type: 'quality_control',
    features: [
      'cc_orders.view',
      'cc_orders.stages',
      'cc_orders.work.qc',
      'cc_store.view',
      'cc_purchase.view',
      'cc_purchase.receive',
      'cc_production.masters.view',
      'catalog.products.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
  {
    name: 'Data entry',
    type: 'production',
    features: ['cc_production.masters.view', 'cc_production.masters.manage', 'cc_production.upload.use', 'cc_production.resin.view', 'cc_production.resin.enter', 'cc_production.chemicals.issue', 'cc_orders.view', 'catalog.products.view', 'attachments.view', 'attachments.manage'],
  },
  {
    name: 'Accounts',
    type: 'finance',
    features: [
      'cc_accounts.view',
      'cc_accounts.record',
      'cc_accounts.series',
      'cc_orders.view',
      'cc_orders.money',
      'cc_orders.stages',
      'cc_orders.work.accounts',
      'cc_purchase.view',
      'cc_vendors.view',
      'customers.companies.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
  {
    name: 'Sales',
    type: 'sales',
    features: [
      'cc_orders.view',
      'cc_orders.full',
      'cc_orders.manage',
      'cc_orders.money',
      'cc_orders.stages',
      'customers.companies.view',
      'customers.companies.manage',
      'cc_production.prices.view',
      'cc_store.view',
      'catalog.products.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
  {
    name: 'Purchase',
    type: 'procurement',
    features: [
      'cc_purchase.view',
      'cc_purchase.manage',
      'cc_purchase.indent',
      'cc_purchase.approve',
      'cc_purchase.receive',
      'cc_vendors.view',
      'cc_vendors.manage',
      'cc_store.view',
      'catalog.products.view',
      'attachments.view',
      'attachments.manage',
    ],
  },
]

async function ensureRole(em: EntityManager, scope: DepartmentSeedScope, name: string): Promise<Role> {
  const existing = await em.findOne(Role, { name, tenantId: scope.tenantId, deletedAt: null })
  if (existing) return existing
  const role = em.create(Role, { name, tenantId: scope.tenantId, minActiveHolders: 0, createdAt: new Date() })
  em.persist(role)
  await em.flush()
  return role
}

async function ensureAcl(em: EntityManager, scope: DepartmentSeedScope, role: Role, features: string[]) {
  const wanted = Array.from(new Set([...EVERYONE, ...features]))
  const existing = await findOneWithDecryption(em, RoleAcl, { role, tenantId: scope.tenantId }, {}, { tenantId: scope.tenantId, organizationId: null })
  if (!existing) {
    em.persist(em.create(RoleAcl, { role, tenantId: scope.tenantId, featuresJson: wanted, isSuperAdmin: false, createdAt: new Date() }))
    return
  }
  const current = Array.isArray(existing.featuresJson) ? existing.featuresJson : []
  const merged = Array.from(new Set([...current, ...wanted]))
  if (merged.length !== current.length) {
    existing.featuresJson = merged
    existing.updatedAt = new Date()
  }
}

export async function seedCcDepartments(em: EntityManager, scope: DepartmentSeedScope) {
  for (const seed of CC_DEPARTMENTS) {
    let department = await em.findOne(Department, { tenantId: scope.tenantId, organizationId: scope.organizationId, name: seed.name, deletedAt: null })
    const role = department?.roleId ? ((await em.findOne(Role, { id: department.roleId, deletedAt: null })) ?? (await ensureRole(em, scope, seed.name))) : await ensureRole(em, scope, seed.name)
    if (!department) {
      department = em.create(Department, { tenantId: scope.tenantId, organizationId: scope.organizationId, name: seed.name, type: seed.type, roleId: role.id })
      em.persist(department)
    } else if (department.roleId !== role.id) {
      department.roleId = role.id
    }
    await ensureAcl(em, scope, role, seed.features)
  }
  await em.flush()
}
