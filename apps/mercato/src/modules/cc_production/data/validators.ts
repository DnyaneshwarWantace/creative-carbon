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

export const RESIN_GRADES = ['PFC', 'PFA', 'PFAC', 'E-GLASS'] as const

export const RESIN_STEPS = ['check_ph_heat', 'stir_1', 'cool_change', 'stir_2'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const kgValue = z.coerce.number().min(0).max(1_000_000)
const optionalNumber = z.preprocess((value) => (value === '' || value === undefined ? null : value), z.coerce.number().min(0).max(100_000).nullable())
const clock = z.preprocess((value) => (value === '' || value === undefined ? null : value), z.string().trim().regex(/^\d{1,2}[:.]\d{2}$/).nullable())
const reading = z
  .object({ tempC: optionalNumber.optional(), time: clock.optional() })
  .optional()
  .transform((value) => ({ tempC: value?.tempC ?? null, time: value?.time ?? null }))

const stepSchema = z.object({ done: z.boolean().optional(), ph: optionalNumber.optional() })

export const resinProcessSchema = z
  .object({
    steps: z.record(z.string(), stepSchema).optional(),
    startHeating: reading,
    stopHeating: reading,
    reactionStart: reading,
    reactionComplete: reading,
    gelChecked: z.boolean().optional(),
    vacuumStart: clock.optional(),
    coolingDuration: clock.optional(),
  })
  .optional()
  .transform((value) => ({
    steps: Object.fromEntries(Object.entries(value?.steps ?? {}).filter(([key]) => (RESIN_STEPS as readonly string[]).includes(key)).map(([key, step]) => [key, { done: Boolean(step?.done), ph: step?.ph ?? null }])) as Record<string, { done: boolean; ph: number | null }>,
    startHeating: value?.startHeating ?? { tempC: null, time: null },
    stopHeating: value?.stopHeating ?? { tempC: null, time: null },
    reactionStart: value?.reactionStart ?? { tempC: null, time: null },
    reactionComplete: value?.reactionComplete ?? { tempC: null, time: null },
    gelChecked: Boolean(value?.gelChecked),
    vacuumStart: value?.vacuumStart ?? null,
    coolingDuration: value?.coolingDuration ?? null,
  }))

export const resinTestsSchema = z
  .object({ ph: optionalNumber.optional(), gelTimeSec: optionalNumber.optional(), viscositySec: optionalNumber.optional(), solidPct: optionalNumber.optional() })
  .optional()
  .transform((value) => ({ ph: value?.ph ?? null, gelTimeSec: value?.gelTimeSec ?? null, viscositySec: value?.viscositySec ?? null, solidPct: value?.solidPct ?? null }))

export const resinBatchInputSchema = z.object({
  batchDate: isoDate,
  batchNo: z.string().trim().min(3).max(40).optional(),
  reactorId: z.string().uuid(),
  grade: z.enum(RESIN_GRADES),
  materials: z
    .array(z.object({ productId: z.string().uuid(), kg: kgValue, lotId: z.string().uuid().nullable().optional() }))
    .max(30)
    .default([]),
  process: resinProcessSchema,
  tests: resinTestsSchema,
  waterRemovedKg: optionalNumber.optional().transform((value) => value ?? null),
  yieldKg: optionalNumber.optional().transform((value) => value ?? null),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export type ResinBatchInput = z.infer<typeof resinBatchInputSchema>

export const resinBatchUpdateSchema = resinBatchInputSchema.extend({ id: z.string().uuid() })

export const resinActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['post', 'fail', 'reopen', 'sign_chemist', 'sign_incharge', 'delete']),
  reason: z.string().trim().max(500).optional(),
})

export const resinListSchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(['draft', 'posted', 'failed', 'all']).default('all'),
  grade: z.enum(RESIN_GRADES).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const resinSetupSchema = z.object({ date: isoDate.optional() })

export const chemicalIssueInputSchema = z.object({
  issueDate: isoDate,
  productId: z.string().uuid(),
  kg: z.coerce.number().positive().max(1_000_000),
  usedFor: z.enum(['coating', 'other']),
  dryerCode: z.string().trim().max(40).nullable().optional(),
  lotId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export const chemicalIssueListSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  productId: z.string().uuid().optional(),
})

export const chemicalIssueCancelSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(2).max(500) })

export const chemicalRegisterSchema = z.object({
  item: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
})

export const COATING_SLOTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'] as const

const nullableNumber = optionalNumber.optional().transform((value) => value ?? null)

export const coatingRowSchema = z.object({
  sn: z.coerce.number().int().min(1).max(30),
  clothProductId: z.string().uuid(),
  gsm: nullableNumber,
  kushan: nullableNumber,
  treatedWeight: nullableNumber,
  rawKg: z.coerce.number().min(0).max(100_000),
  balanceRawKg: nullableNumber,
  coatedNos: z.coerce.number().int().min(0).max(100_000),
  resinLotId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  rcPct: nullableNumber,
  vcPct: nullableNumber,
})

export const coatingSlotSchema = z.object({
  time: z.string().trim().regex(/^\d{1,2}[:.]\d{2}$/),
  dbpKg: nullableNumber,
  oleicKg: nullableNumber,
  outputKg: nullableNumber,
})

export const coatingSheetInputSchema = z.object({
  sheetDate: isoDate,
  dryerId: z.string().uuid(),
  rows: z.array(coatingRowSchema).max(30).default([]),
  slots: z.array(coatingSlotSchema).max(16).default([]),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export type CoatingSheetInput = z.infer<typeof coatingSheetInputSchema>

export const coatingSheetUpdateSchema = coatingSheetInputSchema.extend({ id: z.string().uuid() })

export const coatingActionSchema = z.object({ id: z.string().uuid(), action: z.enum(['post', 'reopen', 'delete']) })

export const coatingListSchema = z.object({
  id: z.string().uuid().optional(),
  date: isoDate.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

export const bstageScrapSchema = z.object({
  lotId: z.string().uuid(),
  kg: z.coerce.number().positive().max(1_000_000).optional(),
  reason: z.string().trim().min(2).max(500),
})

export const pressSheetSchema = z.object({
  thicknessMm: z.coerce.number().positive().max(500),
  count: z.coerce.number().int().min(1).max(500).default(1),
  weightKg: z.coerce.number().positive().max(100_000),
  weightMinKg: nullableNumber,
  grade: z.string().trim().min(1).max(40),
})

export const pressDaylightSchema = z.object({
  no: z.coerce.number().int().min(1).max(100),
  sheets: z.array(pressSheetSchema).min(1).max(10),
})

export const pressLotChoiceSchema = z.object({ grade: z.string().trim().min(1).max(40), lotId: z.string().uuid(), reason: z.string().trim().max(500).default('') })

export const PRESS_HEATING_FIELDS = [
  'hydraulicPressure',
  'formingStart',
  'formingComplete',
  'steamStart',
  'temp120At',
  'maxTempAt',
  'soakingTime',
  'cbtMaxTemp',
  'coolingStart',
  'coolingStop',
  'totalTime',
  'remarks',
  'inchargeSign',
  'operatorSign',
] as const

export const pressBatchInputSchema = z.object({
  batchDate: isoDate,
  pressId: z.string().uuid(),
  cycleNo: z.preprocess((value) => (value === '' || value === undefined ? null : value), z.coerce.number().int().min(0).max(100_000).nullable()).optional(),
  daylights: z.array(pressDaylightSchema).max(100).default([]),
  lotChoices: z.array(pressLotChoiceSchema).max(50).default([]),
  heating: z.record(z.string(), z.union([z.string().max(200), z.number(), z.null()])).nullable().optional(),
  checkedBy: z.string().trim().max(120).nullable().optional(),
  remark: z.string().trim().max(1000).nullable().optional(),
})

export type PressBatchInput = z.infer<typeof pressBatchInputSchema>

export const pressBatchUpdateSchema = pressBatchInputSchema.extend({ id: z.string().uuid() })

export const pressActionSchema = z.object({ id: z.string().uuid(), action: z.enum(['post', 'reopen', 'cancel', 'review']), reason: z.string().trim().max(500).optional() })

export const pressListSchema = z.object({
  id: z.string().uuid().optional(),
  date: isoDate.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  pressId: z.string().uuid().optional(),
  status: z.enum(['draft', 'posted', 'cancelled', 'all']).default('all'),
})

export const pressSetupSchema = z.object({ date: isoDate.optional() })
