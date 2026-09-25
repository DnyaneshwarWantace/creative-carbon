export type StageFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'

export type StageField = {
  key: string
  label: string
  type: StageFieldType
  required?: boolean
  options?: string[]
  unit?: string | null
}

export type QcParameter = { parameter: string; classification: string; specification: string }

export type StageDefinitionView = {
  id: string
  code: string
  name: string
  subjectType: 'order' | 'order_line'
  phase: string | null
  phaseLabel: string | null
  unit: string | null
  sequence: number
  department: string
  kind: 'form' | 'qc_test' | 'production_output'
  fields: StageField[]
  config: { qcParameters?: QcParameter[] }
  isOptional: boolean
  isAutomatic: boolean
  isActive: boolean
  updatedAt: string | null
}

export type StageRunView = {
  id: string
  status: 'in_progress' | 'completed' | 'reverted' | 'skipped'
  data: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  completedBy: string | null
  revertReason: string | null
  revertedAt: string | null
  revertedBy: string | null
}

export type FlowStage = {
  code: string
  name: string
  department: string
  kind: string
  phase: string | null
  phaseLabel: string | null
  unit: string | null
  isOptional: boolean
  isAutomatic: boolean
  state: 'done' | 'current' | 'upcoming' | 'skipped'
  run: StageRunView | null
  history: StageRunView[]
}

export type FlowLine = {
  lineId: string
  productId: string | null
  productName: string | null
  productCode: string | null
  quantity: string | null
  quantityUnit: string | null
  batchNumber: string | null
  started: boolean
  finished: boolean
  currentStageCode: string | null
  stages: FlowStage[]
}

export type OrderFlow = {
  order: {
    id: string
    orderNumber: string | null
    customerName: string | null
    currentStageCode: string | null
    finished: boolean
  }
  stages: FlowStage[]
  lines: FlowLine[]
  definitions: StageDefinitionView[]
}

export type StageTarget = {
  orderId: string
  subjectType: 'order' | 'order_line'
  subjectId: string
  stageCode: string
}

export type QcRowValue = {
  parameter: string
  classification: string
  specification: string
  observation: string
  remark: string
  result: 'pass' | 'fail' | ''
}

export const DEPARTMENT_LABELS: Record<string, string> = {
  sales: 'Sales',
  accounts: 'Accounts',
  rnd: 'R&D',
  planning: 'Planning',
  store: 'Store',
  production: 'Production',
  qc: 'Quality Control',
  qa: 'Quality Assurance',
  dispatch: 'Dispatch',
}

export function stripInternal(message: unknown, fallback: string): string {
  if (typeof message !== 'string' || !message.trim()) return fallback
  return message.replace(/^\[internal\]\s*/, '')
}
