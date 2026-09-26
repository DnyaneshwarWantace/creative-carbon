import { z } from 'zod'

export const listQuerySchema = z.object({ key: z.string().trim().max(60).optional() })

export const listSaveSchema = z.union([
  z.object({
    key: z.string().trim().min(1).max(60),
    options: z.array(z.object({ value: z.string().max(200), active: z.boolean() })).max(200),
  }),
  z.object({ key: z.string().trim().min(1).max(60), reset: z.literal(true) }),
])

export type ListSaveInput = z.infer<typeof listSaveSchema>
