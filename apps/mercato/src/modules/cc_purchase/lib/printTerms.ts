export const PO_FORM_NO = 'CCCPL/F/PUR/03'

export const PO_PRINT_TERMS = [
  { key: 'specialInstruction', label: 'Special instruction', placeholder: 'Please provide test certificate along with delivery' },
  { key: 'deliveryPlace', label: 'Delivery at', placeholder: 'Kanera plant' },
  { key: 'taxes', label: 'Taxes', placeholder: 'IGST 18% extra as applicable' },
  { key: 'packingForwarding', label: 'P & F', placeholder: 'Nil' },
  { key: 'delivery', label: 'Delivery', placeholder: 'Immediate' },
  { key: 'through', label: 'Through', placeholder: 'Local transport' },
  { key: 'payment', label: 'Payment', placeholder: 'Routine' },
  { key: 'guarantee', label: 'Guarantee / warranty', placeholder: '12 months from the date of supply' },
] as const

export type PoPrintTermKey = (typeof PO_PRINT_TERMS)[number]['key']
export type PoPrintTerms = Partial<Record<PoPrintTermKey, string | null>>

export function cleanPrintTerms(value: PoPrintTerms | null | undefined): PoPrintTerms | null {
  if (!value) return null
  const out: PoPrintTerms = {}
  for (const { key } of PO_PRINT_TERMS) {
    const text = value[key]?.trim()
    if (text) out[key] = text
  }
  return Object.keys(out).length ? out : null
}

export function requiresSupplierTc(specialInstruction: string | null | undefined): boolean {
  return /test\s*certificate|\bMTC\b|\bTC\b|\bCOA\b|certificate of analysis/i.test(specialInstruction ?? '')
}
