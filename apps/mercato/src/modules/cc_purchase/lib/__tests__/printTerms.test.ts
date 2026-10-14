import { cleanPrintTerms, requiresSupplierTc } from '../printTerms'

describe('PO print terms', () => {
  it('asks the supplier for a certificate when the special instruction says so', () => {
    expect(requiresSupplierTc('Please provide test certificate along with delivery')).toBe(true)
    expect(requiresSupplierTc('Send MTC with the material')).toBe(true)
    expect(requiresSupplierTc('Deliver in the morning only')).toBe(false)
    expect(requiresSupplierTc(null)).toBe(false)
  })

  it('drops empty terms and returns null when nothing is left', () => {
    expect(cleanPrintTerms({ taxes: ' IGST extra ', delivery: '  ', through: null })).toEqual({ taxes: 'IGST extra' })
    expect(cleanPrintTerms({ taxes: '' })).toBeNull()
    expect(cleanPrintTerms(null)).toBeNull()
  })
})
