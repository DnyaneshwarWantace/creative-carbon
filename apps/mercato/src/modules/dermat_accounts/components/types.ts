export type PiLine = {
  productId: string
  code: string | null
  title: string
  brandName: string | null
  packSize: string | null
  hsn: string | null
  quantity: number
  rate: number | null
  discountPercent: number
  gstPercent: number
  taxable: number
  gst: number
  total: number
}

export type PiView = {
  id: string
  code: string
  orderId: string
  orderNo: string
  customerId: string
  customerName: string
  customerGstin: string | null
  piDate: string
  validUntil: string | null
  status: 'draft' | 'sent' | 'cancelled'
  advancePercent: number | null
  advanceAmount: number | null
  pricesIncludeGst: boolean
  lines: PiLine[]
  totals: { gross: number; discount: number; taxable: number; gst: number; total: number }
  terms: string | null
  bankDetails: string | null
  notes: string | null
  sentAt: string | null
  sentByName: string | null
  createdByName: string | null
  cancelReason: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  createdAt: string
  updatedAt: string
}

export type CompanyView = {
  id: string | null
  name: string
  legalName: string | null
  gstin: string | null
  pan: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  bankName: string | null
  bankBranch: string | null
  bankAccount: string | null
  bankIfsc: string | null
  upiId: string | null
  signatory: string | null
  piTerms: string | null
  invoiceTerms: string | null
  piValidityDays: number
  updatedAt: string | null
}

export const PI_STATUS: Record<PiView['status'], { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft: { label: 'Draft', variant: 'warning' },
  sent: { label: 'Sent to customer', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}
