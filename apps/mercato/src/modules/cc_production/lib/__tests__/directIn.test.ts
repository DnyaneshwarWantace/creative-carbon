import { directInSchema } from '../../data/validators'

const base = { inDate: '2026-10-15', supplier: 'Ketan Chemical', productId: '11111111-1111-4111-8111-111111111111', kg: 25 }

describe('bought-in entry', () => {
  it('accepts a supplier picked from the vendor list, or a typed name with no vendor', () => {
    expect(directInSchema.safeParse({ ...base, vendorId: '22222222-2222-4222-8222-222222222222' }).success).toBe(true)
    expect(directInSchema.safeParse({ ...base, vendorId: null }).success).toBe(true)
    expect(directInSchema.safeParse(base).success).toBe(true)
  })

  it('still needs a supplier name and rejects a vendor id that is not an id', () => {
    expect(directInSchema.safeParse({ ...base, supplier: '' }).success).toBe(false)
    expect(directInSchema.safeParse({ ...base, vendorId: 'not-an-id' }).success).toBe(false)
  })
})
