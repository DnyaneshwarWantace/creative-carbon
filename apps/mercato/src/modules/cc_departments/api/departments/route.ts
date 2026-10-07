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
import { Department } from '../../data/entities'
import { departmentCreateSchema, departmentUpdateSchema, departmentTypeSchema } from '../../data/validators'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
    type: z.string().optional(),
    isActive: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    id: z.string().uuid().optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_departments.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_departments.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_departments.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['cc_departments.manage'] },
}

export const metadata = routeMetadata

const rawBodySchema = z.object({}).passthrough()

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: Department,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: {
    entityType: (E as { cc_departments?: { department?: string } }).cc_departments?.department
      ?? 'cc_departments:department',
  },
  list: {
    schema: listSchema,
    entityId: (E as { cc_departments?: { department?: string } }).cc_departments?.department
      ?? 'cc_departments:department',
    fields: [
      'id',
      'name',
      'type',
      'contact_email',
      'contact_phone',
      'role_id',
      'is_active',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      type: 'type',
      contactEmail: 'contact_email',
      contactPhone: 'contact_phone',
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
          { contact_email: { $ilike: pattern } },
          { contact_phone: { $ilike: pattern } },
        ]
      }
      if (query.type) filters.type = { $eq: query.type }
      if (query.isActive === 'true') filters.is_active = { $eq: true }
      if (query.isActive === 'false') filters.is_active = { $eq: false }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'cc_departments.departments.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return departmentCreateSchema.parse(scoped)
      },
      response: ({ result }) => ({
        id: result?.departmentId ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'cc_departments.departments.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate, { requireOrganization: false })
        return departmentUpdateSchema.parse(scoped)
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'cc_departments.departments.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: translate('cc_departments.errors.id_required', 'Department id is required') })
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

const buildCcDepartmentsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'CcDepartments',
})

const departmentListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: departmentTypeSchema,
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  role_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

const departmentCreateResponseSchema = z.object({
  id: z.string().uuid().nullable(),
})

export const openApi = buildCcDepartmentsCrudOpenApi({
  resourceName: 'Department',
  pluralName: 'Departments',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(departmentListItemSchema),
  create: {
    schema: departmentCreateSchema,
    responseSchema: departmentCreateResponseSchema,
    description: 'Creates a department master-data record.',
  },
  update: {
    schema: departmentUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a department record.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft-deletes a department by id.',
  },
})
