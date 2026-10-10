import { z } from 'zod'

export const goLiveUpdateSchema = z.object({
  cutoverDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetDays: z.coerce.number().int().min(1).max(90).optional(),
  confirm: z.object({ key: z.enum(['series', 'training', 'data_entry', 'hosting', 'paper_closed']), done: z.boolean() }).optional(),
})
