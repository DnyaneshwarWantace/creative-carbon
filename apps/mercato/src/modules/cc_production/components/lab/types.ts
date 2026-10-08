export type LabResult = 'pass' | 'fail' | 'pending'

export type LabReportFile = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }

export type LabTest = {
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
  createdAt: string
  updatedAt: string
}
