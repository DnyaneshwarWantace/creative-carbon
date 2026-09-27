import { z } from 'zod'
import { isValidPhoneNumber } from '@open-mercato/shared/lib/phone'

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

const clearableEmailSchema = z.preprocess(
  emptyStringToNull,
  z.string().email().max(320).nullable().optional(),
)

const clearablePhoneSchema = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .trim()
    .max(50)
    .refine((val) => isValidPhoneNumber(val), { message: 'dermat_vendors.errors.phoneInvalid' })
    .nullable()
    .optional(),
)

const clearableGstSchema = z.preprocess(
  (value) => {
    const cleaned = emptyStringToNull(value)
    return typeof cleaned === 'string' ? cleaned.toUpperCase() : cleaned
  },
  z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'GST number must be a valid 15-character GSTIN, e.g. 27AAACT1234A1Z5' })
    .nullable()
    .optional(),
)

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
