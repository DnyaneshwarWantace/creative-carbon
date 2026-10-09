import { z } from 'zod'

const uuid = () => z.string().uuid()

export const VENDOR_CATEGORIES = ['rm_supplier', 'pm_supplier', 'both'] as const

export const vendorCategorySchema = z.enum(VENDOR_CATEGORIES)

const emptyStringToNull = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const clearableTextSchema = (max: number) =>
  z.preprocess(emptyStringToNull, z.string().trim().max(max).nullable().optional())

const clearableEmailSchema = clearableTextSchema(320)

const clearablePhoneSchema = clearableTextSchema(50)

const clearableGstSchema = clearableTextSchema(20)

const clearableCategorySchema = z.preprocess(
  emptyStringToNull,
  z.enum(VENDOR_CATEGORIES).nullable().optional(),
)

const scopedSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const nameSchema = z.string().trim().min(1).max(200)

export const vendorCreateSchema = scopedSchema.extend({
  name: nameSchema,
  code: clearableTextSchema(50),
  gstNumber: clearableGstSchema,
  contactPerson: clearableTextSchema(200),
  contactPhone: clearablePhoneSchema,
  contactEmail: clearableEmailSchema,
  address: clearableTextSchema(1000),
  paymentTerms: clearableTextSchema(100),
  category: clearableCategorySchema,
  isActive: z.boolean().optional(),
})

export const vendorUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(vendorCreateSchema.partial())

export const vendorDeleteSchema = z.object({
  id: uuid(),
})

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>
export type VendorDeleteInput = z.infer<typeof vendorDeleteSchema>
export type VendorCategory = z.infer<typeof vendorCategorySchema>
