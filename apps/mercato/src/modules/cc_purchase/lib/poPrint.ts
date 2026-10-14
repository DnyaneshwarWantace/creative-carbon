import { z } from 'zod'

export const poPrintSchema = z.object({
  formNo: z.string().trim().max(60).default('CCCPL/F/PUR/03'),
  instructions: z.string().trim().max(600).default(''),
  needsTc: z.boolean().default(false),
  deliverAt: z.string().trim().max(200).default('KANERA PLANT'),
  taxes: z.string().trim().max(200).default(''),
  packing: z.string().trim().max(200).default('NILL'),
  delivery: z.string().trim().max(200).default('IMMEDIATE'),
  through: z.string().trim().max(200).default('LOCAL TRANSPORT'),
  payment: z.string().trim().max(200).default('ROUTINE'),
  warranty: z.string().trim().max(300).default('12 MONTHS FROM THE DATE OF DISPATCH OR INSTALLATION WHICHEVER IS EARLIER'),
})

export type PoPrintDetails = z.infer<typeof poPrintSchema>

export const TC_INSTRUCTION = 'PLEASE PROVIDE TEST CERTIFICATE ALONG WITH DELIVERY'

export function defaultPoPrint(input: { interState: boolean; terms: string | null }): PoPrintDetails {
  return poPrintSchema.parse({
    taxes: `${input.interState ? 'IGST' : 'GST'} EXTRA AT APPLICABLE`,
    payment: input.terms?.trim() ? input.terms.trim().toUpperCase() : 'ROUTINE',
  })
}

export function poPrintOf(stored: unknown, fallback: () => PoPrintDetails): PoPrintDetails {
  if (stored) {
    const parsed = poPrintSchema.safeParse(stored)
    if (parsed.success) return parsed.data
  }
  return fallback()
}
