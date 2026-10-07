import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional().nullable()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const rdInputSchema = z.object({
  kind: z.enum(['client', 'npd']).default('client'),
  customerId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  productName: z.string().trim().min(1).max(200),
  brand: text(200),
  productType: text(120),
  ingredients: text(2000),
  texture: text(200),
  fragrance: text(200),
  colour: text(200),
  packSize: text(60),
  notes: text(2000),
  dueDate: day.optional().nullable(),
  assignedName: text(120),
  clientInstruction: text(2000),
  textureReference: text(300),
  targetPh: text(40),
  claims: text(1000),
  sampleQty: text(60),
  ingredientRefs: z.array(z.object({ productId: z.string().uuid(), code: z.string().max(80).nullable(), name: z.string().max(300) })).max(60).optional().nullable(),
})

export const rdUpdateSchema = rdInputSchema.extend({ id: z.string().uuid() })

export const rdActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['start', 'sample_sent', 'feedback', 'drop', 'reopen']),
  sentOn: day.optional().nullable(),
  sentVia: text(200),
  trialId: z.string().uuid().optional().nullable(),
  result: z.enum(['approved', 'changes']).optional(),
  feedback: text(2000),
  note: text(1000),
})

export const rdListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['open', 'samples', 'approved', 'closed', 'all']).default('open'),
  kind: z.enum(['client', 'npd']).optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
})

const percent = z.coerce.number().finite().min(0).max(100)

export const rdFormulaLineSchema = z.object({
  id: z.string().min(1).max(40),
  phase: text(80),
  productId: z.string().uuid().optional().nullable(),
  code: text(80),
  name: z.string().trim().min(1).max(300),
  function: text(120),
  percent,
  isBalance: z.boolean().default(false),
  note: text(500),
})

export const rdTrialInputSchema = z.object({
  requestId: z.string().uuid(),
  copyFrom: z.string().uuid().optional().nullable(),
})

export const rdTrialUpdateSchema = z.object({
  id: z.string().uuid(),
  batchDate: day.optional().nullable(),
  chemistName: text(120),
  batchSize: z.coerce.number().finite().positive().max(1_000_000).optional().nullable(),
  batchUnit: z.enum(['g', 'kg', 'ml', 'l']).default('g'),
  aim: text(2000),
  procedure: text(8000),
  formula: z.array(rdFormulaLineSchema).max(80),
})

const values = z.record(z.string().max(120), z.string().trim().max(500))

export const rdTrialActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['submit', 'record_result', 'start_stability', 'record_reading', 'finish_stability', 'approve', 'reject', 'reopen', 'make_bom']),
  values: values.optional(),
  result: z.enum(['pass', 'fail']).optional(),
  remarks: text(2000),
  startDate: day.optional().nullable(),
  conditions: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  checkpoints: z.array(z.coerce.number().int().min(0).max(1095)).max(20).optional(),
  condition: z.string().trim().max(120).optional(),
  day: z.coerce.number().int().min(0).max(1095).optional(),
  readingDate: day.optional().nullable(),
  productId: z.string().uuid().optional(),
  note: text(1000),
})

export const rdTrialListSchema = z.object({
  requestId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
})

export const rdReportSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

export type RdInput = z.infer<typeof rdInputSchema>
export type RdTrialUpdate = z.infer<typeof rdTrialUpdateSchema>
export type RdTrialAction = z.infer<typeof rdTrialActionSchema>
export type RdAction = z.infer<typeof rdActionSchema>
