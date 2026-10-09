import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { CrudIndexerConfig, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { Vendor } from '../data/entities'
import { checkVendor, nextVendorCode, type VendorValues } from '../lib/checkVendor'
import {
  vendorCreateSchema,
  vendorUpdateSchema,
  type VendorCreateInput,
  type VendorUpdateInput,
} from '../data/validators'

const vendorCrudIndexer: CrudIndexerConfig<Vendor> = {
  entityType: (E as { cc_vendors?: { vendor?: string } }).cc_vendors?.vendor
    ?? 'cc_vendors:vendor',
}

const vendorCrudEvents: CrudEventsConfig = {
  module: 'cc_vendors',
  entity: 'vendor',
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

const createVendorCommand: CommandHandler<VendorCreateInput, { vendorId: string }> = {
  id: 'cc_vendors.vendors.create',
  async execute(rawInput, ctx) {
    const parsed = vendorCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { tenantId: parsed.tenantId, organizationId: parsed.organizationId }
    const checked = await checkVendor(em, scope, {
      name: parsed.name,
      code: parsed.code ?? null,
      gstNumber: parsed.gstNumber ?? null,
      contactPerson: parsed.contactPerson ?? null,
      contactPhone: parsed.contactPhone ?? null,
      contactEmail: parsed.contactEmail ?? null,
      address: parsed.address ?? null,
      paymentTerms: parsed.paymentTerms ?? null,
      category: parsed.category ?? null,
    })
    let vendor: Vendor | null = null
    for (let attempt = 0; attempt < 3 && !vendor; attempt += 1) {
      const candidate = em.create(Vendor, {
        ...scope,
        ...checked,
        code: checked.code ?? (await nextVendorCode(em, scope)),
        isActive: parsed.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      try {
        await em.persist(candidate).flush()
        vendor = candidate
      } catch (error) {
        em.clear()
        const duplicate = /cc_vendors_org_tenant_code_uq/.test(String((error as Error).message))
        if (!duplicate) throw error
        if (checked.code) throw new CrudHttpError(409, { error: `Vendor code ${checked.code} is already used`, fieldErrors: { code: `Vendor code ${checked.code} is already used` } })
      }
    }
    if (!vendor) throw new CrudHttpError(409, { error: '[internal] could not assign a vendor code' })

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: vendor,
      identifiers: {
        id: vendor.id,
        organizationId: vendor.organizationId,
        tenantId: vendor.tenantId,
      },
      indexer: vendorCrudIndexer,
      events: vendorCrudEvents,
    })

    return { vendorId: vendor.id }
  },
}

const updateVendorCommand: CommandHandler<VendorUpdateInput, { vendorId: string }> = {
  id: 'cc_vendors.vendors.update',
  async execute(rawInput, ctx) {
    const parsed = vendorUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const vendor = await em.findOne(Vendor, { id: parsed.id })
    if (!vendor) throw notFound('Vendor not found')
    ensureTenantScope(ctx, vendor.tenantId)
    ensureOrganizationScope(ctx, vendor.organizationId)

    const current: VendorValues = {
      name: vendor.name,
      code: vendor.code ?? null,
      gstNumber: vendor.gstNumber ?? null,
      contactPerson: vendor.contactPerson ?? null,
      contactPhone: vendor.contactPhone ?? null,
      contactEmail: vendor.contactEmail ?? null,
      address: vendor.address ?? null,
      paymentTerms: vendor.paymentTerms ?? null,
      category: vendor.category ?? null,
    }
    const pick = <K extends keyof VendorValues>(field: K): VendorValues[K] => (parsed[field] !== undefined ? ((parsed[field] ?? null) as VendorValues[K]) : current[field])
    const checked = await checkVendor(
      em,
      { tenantId: vendor.tenantId, organizationId: vendor.organizationId },
      {
        name: pick('name'),
        code: pick('code'),
        gstNumber: pick('gstNumber'),
        contactPerson: pick('contactPerson'),
        contactPhone: pick('contactPhone'),
        contactEmail: pick('contactEmail'),
        address: pick('address'),
        paymentTerms: pick('paymentTerms'),
        category: pick('category'),
      },
      { id: vendor.id, ...current },
    )
    Object.assign(vendor, checked)
    if (parsed.isActive !== undefined) vendor.isActive = parsed.isActive

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: vendor,
      identifiers: {
        id: vendor.id,
        organizationId: vendor.organizationId,
        tenantId: vendor.tenantId,
      },
      indexer: vendorCrudIndexer,
      events: vendorCrudEvents,
    })

    return { vendorId: vendor.id }
  },
}

const deleteVendorCommand: CommandHandler<{ id: string }, { vendorId: string }> = {
  id: 'cc_vendors.vendors.delete',
  async execute(rawInput, ctx) {
    const id = typeof rawInput?.id === 'string' ? rawInput.id : null
    if (!id) throw new CrudHttpError(400, { error: '[internal] Vendor id is required' })
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const vendor = await em.findOne(Vendor, { id })
    if (!vendor) throw notFound('Vendor not found')
    ensureTenantScope(ctx, vendor.tenantId)
    ensureOrganizationScope(ctx, vendor.organizationId)

    vendor.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: vendor,
      identifiers: {
        id: vendor.id,
        organizationId: vendor.organizationId,
        tenantId: vendor.tenantId,
      },
      indexer: vendorCrudIndexer,
      events: vendorCrudEvents,
    })

    return { vendorId: vendor.id }
  },
}

registerCommand(createVendorCommand)
registerCommand(updateVendorCommand)
registerCommand(deleteVendorCommand)
