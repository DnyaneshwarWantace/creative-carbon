import { z } from 'zod'
import { isValidPhoneNumber } from '@open-mercato/shared/lib/phone'

const uuid = () => z.string().uuid()

export const DEPARTMENT_TYPES = [
  'sales',
  'procurement',
  'production',
  'quality_control',
  'finance',
  'store',
  'admin',
] as const

export const departmentTypeSchema = z.enum(DEPARTMENT_TYPES)

const emptyStringToNull = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

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
    .refine((val) => isValidPhoneNumber(val), { message: 'cc_departments.errors.phoneInvalid' })
    .nullable()
    .optional(),
)

const scopedSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const nameSchema = z.string().trim().min(1).max(200)

export const departmentCreateSchema = scopedSchema.extend({
  name: nameSchema,
  type: departmentTypeSchema,
  contactEmail: clearableEmailSchema,
  contactPhone: clearablePhoneSchema,
  isActive: z.boolean().optional(),
})

export const departmentUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(departmentCreateSchema.partial())

export const departmentDeleteSchema = z.object({
  id: uuid(),
})

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>
export type DepartmentDeleteInput = z.infer<typeof departmentDeleteSchema>
export type DepartmentType = z.infer<typeof departmentTypeSchema>
