import type { Order } from '../../cc_orders/components/types'

export type EnquiryStage = 'new' | 'quoted' | 'negotiating' | 'won' | 'lost'

export type HistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type Enquiry = {
  id: string
  enquiryNo: string
  source: string
  receivedAt: string
  customerId: string | null
  customerName: string | null
  companyName: string | null
  partyName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  place: string | null
  subject: string
  details: string | null
  ownerName: string | null
  stage: EnquiryStage
  nextActionOn: string | null
  nextActionNote: string | null
  lostReason: string | null
  orderId: string | null
  overdue: boolean
  byName: string | null
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
  quotations?: Array<{ id: string; quoteNo: string; quoteDate: string; status: QuotationStatus; totalAmount: number; currency: string; orderId: string | null; orderNo: string | null }>
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'

export type QuotationRow = {
  id: string
  quoteNo: string
  quoteDate: string
  validUntil: string | null
  customerId: string
  customerName: string
  enquiryId: string | null
  enquiryNo: string | null
  market: 'domestic' | 'export'
  incoterm: string | null
  currency: string
  totalAmount: number
  lineCount: number
  status: QuotationStatus
  expired: boolean
  orderId: string | null
  orderNo: string | null
  byName: string | null
  updatedAt: string
}

export type Quotation = Omit<Order, 'status' | 'stages' | 'payments' | 'events' | 'documents' | 'canSeeMoney' | 'onHold' | 'createdByName'> & {
  quoteNo: string
  quoteDate: string
  validUntil: string | null
  enquiryId: string | null
  enquiryNo: string | null
  status: QuotationStatus
  expired: boolean
  sentAt: string | null
  convertedOrderId: string | null
  convertedOrderNo: string | null
  byName: string | null
  history: HistoryEntry[]
}

export const STAGE_LABEL: Record<EnquiryStage, string> = { new: 'New', quoted: 'Quoted', negotiating: 'Negotiating', won: 'Won', lost: 'Lost' }
export const STAGE_VARIANT: Record<EnquiryStage, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = { new: 'info', quoted: 'warning', negotiating: 'warning', won: 'success', lost: 'neutral' }
export const QUOTE_LABEL: Record<QuotationStatus, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', converted: 'Order made' }
export const QUOTE_VARIANT: Record<QuotationStatus, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = { draft: 'neutral', sent: 'info', accepted: 'success', rejected: 'error', converted: 'success' }
