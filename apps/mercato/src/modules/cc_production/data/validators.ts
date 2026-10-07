import { z } from 'zod'
import { MASTER_TYPES, type MasterColumn, type MasterDef } from '../lib/masterDefs'

export const masterTypeSchema = z.enum(MASTER_TYPES as [string, ...string[]])

export const masterListQuerySchema = z.object({
  type: masterTypeSchema,
  search: z.string().trim().max(200).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
})

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

function columnSchema(column: MasterColumn): z.ZodTypeAny {
  let base: z.ZodTypeAny
  switch (column.kind) {
    case 'int':
      base = z.coerce.number().int().min(0).max(1_000_000)
      break
    case 'number':
      base = z.coerce.number().min(0).max(100_000_000)
      break
    case 'bool':
      base = z.boolean()
      break
    case 'select':
      base = z.enum((column.options ?? []).map((option) => option.value) as [string, ...string[]])
      break
    case 'customer':
      base = z.string().uuid()
      break
    default:
      base = z.string().trim().min(1).max(500)
  }
  if (column.kind === 'bool') return base.optional()
  return column.required ? z.preprocess(blankToNull, base) : z.preprocess(blankToNull, base.nullable()).optional()
}

export function masterInputSchema(def: MasterDef) {
  return z.object(Object.fromEntries(def.columns.map((column) => [column.key, columnSchema(column)])))
}

export const masterWriteSchema = z.object({
  type: masterTypeSchema,
  id: z.string().uuid().optional(),
  values: z.record(z.string(), z.unknown()),
})

export const masterDeleteSchema = z.object({ type: masterTypeSchema, id: z.string().uuid() })

export const masterImportSchema = z.object({
  type: masterTypeSchema,
  dryRun: z.boolean().default(true),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(5000),
})

export type MasterImportInput = z.infer<typeof masterImportSchema>
