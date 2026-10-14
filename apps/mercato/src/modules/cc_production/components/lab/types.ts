import type { Certificate } from '../../lib/testCertificate'
export type LabResult = 'pass' | 'fail' | 'pending'

export type LabReportFile = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string; superseded?: boolean; revision?: number | null }

export type LabRevisionView = { revision: number; issuedAt: string | null; amendedAt: string; amendedByName: string | null; reason: string; values: Record<string, unknown> }

export type LabTest = {
  certificate?: Certificate | null
  id: string
  testPoint: 'incoming' | 'outgoing'
  testDate: string
  testedBy: string | null
  reportNo: string | null
  lotRefs: string | null
  productId: string | null
  itemTitle: string | null
  customerId: string | null
  customerName: string | null
  orderId: string | null
  orderNo: string | null
  testType: string
  standard: string | null
  result: LabResult
  notes: string | null
  byName: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  reports?: LabReportFile[]
  supersededReports?: LabReportFile[]
  revision?: number
  issuedAt?: string | null
  issuedByName?: string | null
  revisions?: LabRevisionView[]
  createdAt: string
  updatedAt: string
}
