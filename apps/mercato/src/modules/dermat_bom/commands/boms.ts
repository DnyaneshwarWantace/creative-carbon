import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError, notFound, conflict } from '@open-mercato/shared/lib/crud/errors'
import type { CrudIndexerConfig, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { Bom } from '../data/entities'
import {
  bomCreateSchema,
  bomUpdateSchema,
  type BomCreateInput,
  type BomUpdateInput,
} from '../data/validators'
import { BOM_BASE_BATCH_KG } from '../lib/constants'

const bomCrudIndexer: CrudIndexerConfig<Bom> = {
  entityType: (E as { dermat_bom?: { bom?: string } }).dermat_bom?.bom ?? 'dermat_bom:bom',
}

const bomCrudEvents: CrudEventsConfig = {
  module: 'dermat_bom',
  entity: 'bom',
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

const createBomCommand: CommandHandler<BomCreateInput, { bomId: string }> = {
  id: 'dermat_bom.boms.create',
  async execute(rawInput, ctx) {
    const parsed = bomCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // The bom_name unique constraint (org, tenant, bom_name) means a second
    // BOM for a product whose title collides with an existing BOM's name
    // (e.g. no Formulation Name entered to distinguish it) hits a raw
    // Postgres duplicate-key error that surfaces to the client as a generic
    // 500. Check first so the real reason reaches the user.
    const existing = await em.findOne(Bom, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      bomName: parsed.bomName,
      deletedAt: null,
    })
    if (existing) {
      throw conflict(
        `A BOM named "${parsed.bomName}" already exists. Add a Formulation Name (e.g. "Bulk", "Gel Formulation") to create another version for this product.`,
      )
    }

    const bom = em.create(Bom, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      bomName: parsed.bomName,
      catalogProductId: parsed.catalogProductId ?? null,
      batchQuantity: String(BOM_BASE_BATCH_KG),
      version: parsed.version ?? 1,
      isActive: parsed.isActive ?? true,
      metadata: parsed.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(bom)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: bom,
      identifiers: {
        id: bom.id,
        organizationId: bom.organizationId,
        tenantId: bom.tenantId,
      },
      indexer: bomCrudIndexer,
      events: bomCrudEvents,
    })

    return { bomId: bom.id }
  },
}

const updateBomCommand: CommandHandler<BomUpdateInput, { bomId: string }> = {
  id: 'dermat_bom.boms.update',
  async execute(rawInput, ctx) {
    const parsed = bomUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const bom = await em.findOne(Bom, { id: parsed.id })
    if (!bom) throw notFound('BOM not found')
    ensureTenantScope(ctx, bom.tenantId)
    ensureOrganizationScope(ctx, bom.organizationId)

    if (parsed.bomName !== undefined && parsed.bomName !== bom.bomName) {
      const nameCollision = await em.findOne(Bom, {
        organizationId: bom.organizationId,
        tenantId: bom.tenantId,
        bomName: parsed.bomName,
        deletedAt: null,
      })
      if (nameCollision) {
        throw conflict(`A BOM named "${parsed.bomName}" already exists.`)
      }
    }

    if (parsed.bomName !== undefined) bom.bomName = parsed.bomName
    if (parsed.catalogProductId !== undefined) bom.catalogProductId = parsed.catalogProductId
    bom.batchQuantity = String(BOM_BASE_BATCH_KG)
    if (parsed.version !== undefined) bom.version = parsed.version
    if (parsed.isActive !== undefined) bom.isActive = parsed.isActive
    if (parsed.metadata !== undefined) {
      bom.metadata = parsed.metadata === null ? null : { ...(bom.metadata ?? {}), ...parsed.metadata }
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: bom,
      identifiers: {
        id: bom.id,
        organizationId: bom.organizationId,
        tenantId: bom.tenantId,
      },
      indexer: bomCrudIndexer,
      events: bomCrudEvents,
    })

    return { bomId: bom.id }
  },
}

const deleteBomCommand: CommandHandler<{ id: string }, { bomId: string }> = {
  id: 'dermat_bom.boms.delete',
  async execute(rawInput, ctx) {
    const id = typeof rawInput?.id === 'string' ? rawInput.id : null
    if (!id) throw new CrudHttpError(400, { error: '[internal] BOM id is required' })
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const bom = await em.findOne(Bom, { id })
    if (!bom) throw notFound('BOM not found')
    ensureTenantScope(ctx, bom.tenantId)
    ensureOrganizationScope(ctx, bom.organizationId)

    bom.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: bom,
      identifiers: {
        id: bom.id,
        organizationId: bom.organizationId,
        tenantId: bom.tenantId,
      },
      indexer: bomCrudIndexer,
      events: bomCrudEvents,
    })

    return { bomId: bom.id }
  },
}

registerCommand(createBomCommand)
registerCommand(updateBomCommand)
registerCommand(deleteBomCommand)
