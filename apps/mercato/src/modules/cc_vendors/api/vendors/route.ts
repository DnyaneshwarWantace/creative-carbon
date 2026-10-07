import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { withScopedPayload } from '@open-mercato/shared/lib/api/scoped'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { buildIlikeTerm } from '@open-mercato/shared/lib/db/buildIlikeTerm'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema as createSharedPagedListResponseSchema,
  defaultOkResponseSchema,
} from '@open-mercato/shared/lib/openapi/crud'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { Vendor } from '../../data/entities'
import { vendorCreateSchema, vendorUpdateSchema, vendorCategorySchema } from '../../data/validators'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
    category: z.string().optional(),
    isActive: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    id: z.string().uuid().optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_vendors.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_vendors.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_vendors.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['cc_vendors.manage'] },
}

export const metadata = routeMetadata

const rawBodySchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: Vendor,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: {
    entityType: (E as { cc_vendors?: { vendor?: string } }).cc_vendors?.vendor
      ?? 'cc_vendors:vendor',
  },
  list: {
    schema: listSchema,
    entityId: (E as { cc_vendors?: { vendor?: string } }).cc_vendors?.vendor
      ?? 'cc_vendors:vendor',
    fields: [
      'id',
      'name',
      'code',
      'gst_number',
      'contact_person',
      'contact_phone',
      'contact_email',
      'address',
      'payment_terms',
      'category',
      'is_active',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      code: 'code',
      gstNumber: 'gst_number',
      contactPerson: 'contact_person',
      contactPhone: 'contact_phone',
      contactEmail: 'contact_email',
      paymentTerms: 'payment_terms',
      category: 'category',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = { $eq: query.id }
      if (query.search) {
        const pattern = buildIlikeTerm(query.search)
        filters.$or = [
          { name: { $ilike: pattern } },
          { code: { $ilike: pattern } },
          { gst_number: { $ilike: pattern } },
          { contact_person: { $ilike: pattern } },
          { contact_email: { $ilike: pattern } },
          { contact_phone: { $ilike: pattern } },
        ]
      }
      if (query.category) filters.category = { $eq: query.category }
      if (query.isActive === 'true') filters.is_active = { $eq: true }
      if (query.isActive === 'false') filters.is_active = { $eq: false }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'cc_vendors.vendors.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return vendorCreateSchema.parse(scoped)
      },
      response: ({ result }) => ({
        id: result?.vendorId ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'cc_vendors.vendors.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate, { requireOrganization: false })
        return vendorUpdateSchema.parse(scoped)
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'cc_vendors.vendors.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: translate('cc_vendors.errors.id_required', 'Vendor id is required') })
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

const { POST, PUT, DELETE } = crud

export { POST, PUT, DELETE }
export const GET = crud.GET

function createPagedListResponseSchema(itemSchema: z.ZodTypeAny) {
  return createSharedPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildCcVendorsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'CcVendors',
})

const vendorListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable().optional(),
  gst_number: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  category: vendorCategorySchema.nullable().optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

const vendorCreateResponseSchema = z.object({
  id: z.string().uuid().nullable(),
})

export const openApi = buildCcVendorsCrudOpenApi({
  resourceName: 'Vendor',
  pluralName: 'Vendors',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(vendorListItemSchema),
  create: {
    schema: vendorCreateSchema,
    responseSchema: vendorCreateResponseSchema,
    description: 'Creates a vendor master-data record.',
  },
  update: {
    schema: vendorUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a vendor record.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft-deletes a vendor by id.',
  },
})
