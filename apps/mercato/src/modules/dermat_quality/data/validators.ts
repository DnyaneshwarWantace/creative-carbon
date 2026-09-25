import { z } from 'zod'

export const operationSchema = z.enum(['purchase_receipt', 'bulk', 'filling', 'packing'])

export const parameterSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  class: z.string().trim().min(1).max(30),
  spec: z.string().trim().max(300).default(''),
  test: z.enum(['chemical', 'micro']),
})

export const ruleInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  operation: operationSchema,
  productId: z.string().uuid().optional().nullable(),
  requiresChemical: z.boolean().default(true),
  requiresMicro: z.boolean().default(false),
  isActive: z.boolean().default(true),
  parameters: z.array(parameterSchema).max(60),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const ruleUpdateSchema = ruleInputSchema.extend({ id: z.string().uuid() })

export const checkSaveSchema = z.object({
  id: z.string().uuid(),
  batchNo: z.string().trim().max(60).optional().nullable(),
  results: z.array(z.object({ key: z.string().max(60), observation: z.string().max(500), remark: z.string().max(1000) })).max(100),
})

export const decideSchema = z.object({
  id: z.string().uuid(),
  result: z.enum(['pass', 'fail']),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const retestSchema = z.object({ id: z.string().uuid(), note: z.string().trim().min(1).max(1000) })

export const checkListSchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(['pending', 'passed', 'failed']).optional(),
  operation: operationSchema.optional(),
  orderId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
