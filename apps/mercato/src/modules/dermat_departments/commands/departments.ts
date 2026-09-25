import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { CrudIndexerConfig, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { Role, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { Department } from '../data/entities'
import {
  departmentCreateSchema,
  departmentUpdateSchema,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
} from '../data/validators'

const departmentCrudIndexer: CrudIndexerConfig<Department> = {
  entityType: (E as { dermat_departments?: { department?: string } }).dermat_departments?.department
    ?? 'dermat_departments:department',
}

const departmentCrudEvents: CrudEventsConfig = {
  module: 'dermat_departments',
  entity: 'department',
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
  }),
}

function ensureTenantScope(ctx: { auth?: { tenantId?: string | null } | null }, tenantId: string): void {
  if (ctx.auth?.tenantId && ctx.auth.tenantId !== tenantId) {
    throw new CrudHttpError(403, { error: '[internal] tenant scope mismatch' })
  }
}

function ensureOrganizationScope(
  ctx: { selectedOrganizationId?: string | null; auth?: { orgId?: string | null } | null },
  organizationId: string | undefined,
): void {
  const scopedOrgId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null
  if (organizationId && scopedOrgId && organizationId !== scopedOrgId) {
    throw new CrudHttpError(403, { error: '[internal] organization scope mismatch' })
  }
}

const createDepartmentCommand: CommandHandler<DepartmentCreateInput, { departmentId: string }> = {
  id: 'dermat_departments.departments.create',
  async execute(rawInput, ctx) {
    const parsed = departmentCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const department = em.create(Department, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      name: parsed.name,
      type: parsed.type,
      contactEmail: parsed.contactEmail ?? null,
      contactPhone: parsed.contactPhone ?? null,
      isActive: parsed.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(department)
    await em.flush()

    // A Department owns a backing Role 1:1 (Decision: Department = Role). The Role's
    // `role_acls.features_json` becomes the department's access set (managed via the
    // AclEditor on the department edit page), and assigning a user to the department
    // assigns them this Role through the existing `user_roles` join. Cross-module: go
    // through the command bus, never import auth's ORM internals directly.
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result: role } = await commandBus.execute<Record<string, unknown>, Role>(
      'auth.roles.create',
      { input: { name: parsed.name, tenantId: parsed.tenantId }, ctx },
    )
    department.roleId = String(role.id)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: department,
      identifiers: {
        id: department.id,
        organizationId: department.organizationId,
        tenantId: department.tenantId,
      },
      indexer: departmentCrudIndexer,
      events: departmentCrudEvents,
    })

    return { departmentId: department.id }
  },
}

const updateDepartmentCommand: CommandHandler<DepartmentUpdateInput, { departmentId: string }> = {
  id: 'dermat_departments.departments.update',
  async execute(rawInput, ctx) {
    const parsed = departmentUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const department = await em.findOne(Department, { id: parsed.id })
    if (!department) throw notFound('Department not found')
    ensureTenantScope(ctx, department.tenantId)
    ensureOrganizationScope(ctx, department.organizationId)

    const renamed = parsed.name !== undefined && parsed.name !== department.name
    if (parsed.name !== undefined) department.name = parsed.name
    if (parsed.type !== undefined) department.type = parsed.type
    if (parsed.contactEmail !== undefined) department.contactEmail = parsed.contactEmail ?? null
    if (parsed.contactPhone !== undefined) department.contactPhone = parsed.contactPhone ?? null
    if (parsed.isActive !== undefined) department.isActive = parsed.isActive

    await em.flush()

    // Backfill for departments created before the Department-owns-a-Role linkage
    // existed: lazily create the backing Role on first save instead of leaving
    // roleId null forever (which permanently hides the AclEditor on this department).
    if (!department.roleId) {
      const commandBus = ctx.container.resolve('commandBus') as CommandBus
      const { result: role } = await commandBus.execute<Record<string, unknown>, Role>(
        'auth.roles.create',
        { input: { name: department.name, tenantId: department.tenantId }, ctx },
      )
      department.roleId = String(role.id)
      await em.flush()
    } else if (renamed) {
      // Keep the linked Role's name in sync with the department name so the role list
      // (and any place that surfaces role names, e.g. the user's Department picker)
      // never drifts from the department it backs.
      const commandBus = ctx.container.resolve('commandBus') as CommandBus
      await commandBus.execute<Record<string, unknown>, Role>(
        'auth.roles.update',
        { input: { id: department.roleId, name: department.name }, ctx },
      )
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: department,
      identifiers: {
        id: department.id,
        organizationId: department.organizationId,
        tenantId: department.tenantId,
      },
      indexer: departmentCrudIndexer,
      events: departmentCrudEvents,
    })

    return { departmentId: department.id }
  },
}

const deleteDepartmentCommand: CommandHandler<{ id: string }, { departmentId: string }> = {
  id: 'dermat_departments.departments.delete',
  async execute(rawInput, ctx) {
    const id = typeof rawInput?.id === 'string' ? rawInput.id : null
    if (!id) throw new CrudHttpError(400, { error: '[internal] Department id is required' })
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const department = await em.findOne(Department, { id })
    if (!department) throw notFound('Department not found')
    ensureTenantScope(ctx, department.tenantId)
    ensureOrganizationScope(ctx, department.organizationId)

    // Mirror the Role.minActiveHolders guard style (auth module): block the delete
    // with a clear error while the backing role still has holders. Once holders drop
    // to zero the department delete proceeds and the now-orphaned Role is removed too.
    if (department.roleId) {
      const activeHolders = await em.count(UserRole, { role: department.roleId as unknown as Role, deletedAt: null })
      if (activeHolders > 0) {
        const { translate } = await resolveTranslations()
        throw new CrudHttpError(400, {
          error: translate(
            'dermat_departments.errors.hasAssignedUsers',
            'Department cannot be deleted while users are assigned to it',
          ),
        })
      }
    }

    department.deletedAt = new Date()
    await em.flush()

    if (department.roleId) {
      const commandBus = ctx.container.resolve('commandBus') as CommandBus
      await commandBus.execute<{ id: string }, Role>(
        'auth.roles.delete',
        { input: { id: department.roleId }, ctx },
      )
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: department,
      identifiers: {
        id: department.id,
        organizationId: department.organizationId,
        tenantId: department.tenantId,
      },
      indexer: departmentCrudIndexer,
      events: departmentCrudEvents,
    })

    return { departmentId: department.id }
  },
}

registerCommand(createDepartmentCommand)
registerCommand(updateDepartmentCommand)
registerCommand(deleteDepartmentCommand)
