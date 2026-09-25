import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects, buildChanges, requireId } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerContact } from '../data/entities'
import { contactCreateSchema, contactUpdateSchema, type ContactCreateInput, type ContactUpdateInput } from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  requireCustomerEntity,
  ensureSameScope,
  extractUndoPayload,
  resolveParentResourceKind,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { CrudIndexerConfig, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import { resolveRedoSnapshot } from '@open-mercato/shared/lib/commands/redo'

const contactCrudIndexer: CrudIndexerConfig<CustomerContact> = {
  entityType: E.customers.customer_contact,
}

const contactCrudEvents: CrudEventsConfig = {
  module: 'customers',
  entity: 'contact',
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
  }),
}

type ContactSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  entityId: string
  entityKind: string | null
  name: string
  phone: string | null
  email: string | null
  sortOrder: number
}

type ContactUndoPayload = {
  before?: ContactSnapshot | null
  after?: ContactSnapshot | null
}

async function loadContactSnapshot(em: EntityManager, id: string): Promise<ContactSnapshot | null> {
  const contact = await em.findOne(CustomerContact, { id }, { populate: ['entity'] })
  if (!contact) return null
  const entityRef = contact.entity
  const entityKind = (typeof entityRef === 'object' && entityRef !== null && 'kind' in entityRef)
    ? (entityRef as { kind: string }).kind
    : null
  return {
    id: contact.id,
    organizationId: contact.organizationId,
    tenantId: contact.tenantId,
    entityId: typeof entityRef === 'string' ? entityRef : entityRef.id,
    entityKind,
    name: contact.name,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    sortOrder: contact.sortOrder,
  }
}

const createContactCommand: CommandHandler<ContactCreateInput, { contactId: string }> = {
  id: 'customers.contacts.create',
  async execute(rawInput, ctx) {
    const parsed = contactCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const entity = await requireCustomerEntity(em, parsed.entityId, { tenantId: parsed.tenantId, organizationId: parsed.organizationId }, undefined, 'Customer not found')
    ensureSameScope(entity, parsed.organizationId, parsed.tenantId)

    const contact = em.create(CustomerContact, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      entity,
      name: parsed.name,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      sortOrder: parsed.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(contact)
    await em.flush()

    const de = (ctx.container.resolve('dataEngine') as DataEngine)
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: contact,
      identifiers: {
        id: contact.id,
        organizationId: contact.organizationId,
        tenantId: contact.tenantId,
      },
      indexer: contactCrudIndexer,
      events: contactCrudEvents,
    })

    return { contactId: contact.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    return await loadContactSnapshot(em, result.contactId)
  },
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const snapshot = snapshots.after as ContactSnapshot | undefined
    return {
      actionLabel: translate('customers.audit.contacts.create', 'Create contact'),
      resourceKind: 'customers.contact',
      resourceId: result.contactId,
      parentResourceKind: resolveParentResourceKind(snapshot?.entityKind),
      parentResourceId: snapshot?.entityId ?? null,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot ?? null,
        } satisfies ContactUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const contactId = logEntry?.resourceId ?? null
    if (!contactId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const contact = await em.findOne(CustomerContact, { id: contactId })
    if (contact) {
      em.remove(contact)
      await em.flush()
    }
  },
  redo: async ({ logEntry, ctx }) => {
    const after = resolveRedoSnapshot<ContactSnapshot>(logEntry)
    if (!after) {
      throw new CrudHttpError(400, { error: '[internal] redo snapshot unavailable for contact create' })
    }
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const entity = await requireCustomerEntity(em, after.entityId, { tenantId: after.tenantId, organizationId: after.organizationId }, undefined, 'Customer not found')
    let contact = await em.findOne(CustomerContact, { id: after.id })
    if (!contact) {
      contact = em.create(CustomerContact, {
        id: after.id,
        organizationId: after.organizationId,
        tenantId: after.tenantId,
        entity,
        name: after.name,
        phone: after.phone,
        email: after.email,
        sortOrder: after.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(contact)
    } else {
      contact.entity = entity
      contact.name = after.name
      contact.phone = after.phone
      contact.email = after.email
      contact.sortOrder = after.sortOrder
    }
    await em.flush()

    const de = (ctx.container.resolve('dataEngine') as DataEngine)
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: contact,
      identifiers: {
        id: contact.id,
        organizationId: contact.organizationId,
        tenantId: contact.tenantId,
      },
      indexer: contactCrudIndexer,
      events: contactCrudEvents,
    })

    return { contactId: contact.id }
  },
}

const updateContactCommand: CommandHandler<ContactUpdateInput, { contactId: string }> = {
  id: 'customers.contacts.update',
  async prepare(rawInput, ctx) {
    const parsed = contactUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager)
    const snapshot = await loadContactSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const parsed = contactUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const contact = await em.findOne(CustomerContact, { id: parsed.id })
    if (!contact) throw notFound('Contact not found')
    ensureTenantScope(ctx, contact.tenantId)
    ensureOrganizationScope(ctx, contact.organizationId)

    if (parsed.entityId !== undefined) {
      const entity = await requireCustomerEntity(em, parsed.entityId, { tenantId: contact.tenantId, organizationId: contact.organizationId }, undefined, 'Customer not found')
      ensureSameScope(entity, contact.organizationId, contact.tenantId)
      contact.entity = entity
    }

    if (parsed.name !== undefined) contact.name = parsed.name
    if (parsed.phone !== undefined) contact.phone = parsed.phone ?? null
    if (parsed.email !== undefined) contact.email = parsed.email ?? null
    if (parsed.sortOrder !== undefined) contact.sortOrder = parsed.sortOrder
    await em.flush()

    const de = (ctx.container.resolve('dataEngine') as DataEngine)
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: contact,
      identifiers: {
        id: contact.id,
        organizationId: contact.organizationId,
        tenantId: contact.tenantId,
      },
      indexer: contactCrudIndexer,
      events: contactCrudEvents,
    })

    return { contactId: contact.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    return await loadContactSnapshot(em, result.contactId)
  },
  buildLog: async ({ snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ContactSnapshot | undefined
    if (!before) return null
    const afterSnapshot = snapshots.after as ContactSnapshot | undefined
    const changes =
      afterSnapshot && before
        ? buildChanges(
            before as unknown as Record<string, unknown>,
            afterSnapshot as unknown as Record<string, unknown>,
            ['entityId', 'name', 'phone', 'email', 'sortOrder']
          )
        : {}
    return {
      actionLabel: translate('customers.audit.contacts.update', 'Update contact'),
      resourceKind: 'customers.contact',
      resourceId: before.id,
      parentResourceKind: resolveParentResourceKind(before.entityKind),
      parentResourceId: before.entityId ?? null,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: {
        undo: {
          before,
          after: afterSnapshot ?? null,
        } satisfies ContactUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ContactUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let contact = await em.findOne(CustomerContact, { id: before.id })
    const entity = await requireCustomerEntity(em, before.entityId, { tenantId: before.tenantId, organizationId: before.organizationId }, undefined, 'Customer not found')
    if (!contact) {
      contact = em.create(CustomerContact, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        entity,
        name: before.name,
        phone: before.phone,
        email: before.email,
        sortOrder: before.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(contact)
    } else {
      contact.entity = entity
      contact.name = before.name
      contact.phone = before.phone
      contact.email = before.email
      contact.sortOrder = before.sortOrder
    }
    await em.flush()

    const de = (ctx.container.resolve('dataEngine') as DataEngine)
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: contact,
      identifiers: {
        id: contact.id,
        organizationId: contact.organizationId,
        tenantId: contact.tenantId,
      },
      indexer: contactCrudIndexer,
      events: contactCrudEvents,
    })
  },
}

const deleteContactCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { contactId: string }> =
  {
    id: 'customers.contacts.delete',
    async prepare(input, ctx) {
      const id = requireId(input, 'Contact id required')
      const em = (ctx.container.resolve('em') as EntityManager)
      const snapshot = await loadContactSnapshot(em, id)
      return snapshot ? { before: snapshot } : {}
    },
    async execute(input, ctx) {
      const id = requireId(input, 'Contact id required')
      const em = (ctx.container.resolve('em') as EntityManager).fork()
      const contact = await em.findOne(CustomerContact, { id })
      if (!contact) throw notFound('Contact not found')
      ensureTenantScope(ctx, contact.tenantId)
      ensureOrganizationScope(ctx, contact.organizationId)
      em.remove(contact)
      await em.flush()

      const de = (ctx.container.resolve('dataEngine') as DataEngine)
      await emitCrudSideEffects({
        dataEngine: de,
        action: 'deleted',
        entity: contact,
        identifiers: {
          id: contact.id,
          organizationId: contact.organizationId,
          tenantId: contact.tenantId,
        },
        indexer: contactCrudIndexer,
        events: contactCrudEvents,
      })
      return { contactId: contact.id }
    },
    buildLog: async ({ snapshots }) => {
      const before = snapshots.before as ContactSnapshot | undefined
      if (!before) return null
      const { translate } = await resolveTranslations()
      return {
        actionLabel: translate('customers.audit.contacts.delete', 'Delete contact'),
        resourceKind: 'customers.contact',
        resourceId: before.id,
        parentResourceKind: resolveParentResourceKind(before.entityKind),
        parentResourceId: before.entityId ?? null,
        tenantId: before.tenantId,
        organizationId: before.organizationId,
        snapshotBefore: before,
        payload: {
          undo: {
            before,
          } satisfies ContactUndoPayload,
        },
      }
    },
    undo: async ({ logEntry, ctx }) => {
      const payload = extractUndoPayload<ContactUndoPayload>(logEntry)
      const before = payload?.before
      if (!before) return
      const em = (ctx.container.resolve('em') as EntityManager).fork()
      const entity = await requireCustomerEntity(em, before.entityId, { tenantId: before.tenantId, organizationId: before.organizationId }, undefined, 'Customer not found')
      let contact = await em.findOne(CustomerContact, { id: before.id })
      if (!contact) {
        contact = em.create(CustomerContact, {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
          entity,
          name: before.name,
          phone: before.phone,
          email: before.email,
          sortOrder: before.sortOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(contact)
      } else {
        contact.entity = entity
        contact.name = before.name
        contact.phone = before.phone
        contact.email = before.email
        contact.sortOrder = before.sortOrder
      }
      await em.flush()

      const de = (ctx.container.resolve('dataEngine') as DataEngine)
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: contact,
        identifiers: {
          id: contact.id,
          organizationId: contact.organizationId,
          tenantId: contact.tenantId,
        },
        indexer: contactCrudIndexer,
        events: contactCrudEvents,
      })
    },
  }

registerCommand(createContactCommand)
registerCommand(updateContactCommand)
registerCommand(deleteContactCommand)
