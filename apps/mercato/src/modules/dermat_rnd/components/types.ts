export type RequestStatus = 'requested' | 'in_progress' | 'sample_sent' | 'changes' | 'approved' | 'dropped'
export type TrialStatus = 'draft' | 'testing' | 'passed' | 'failed' | 'approved' | 'rejected'
export type StabilityStatus = 'not_started' | 'running' | 'passed' | 'failed'
export type PassFail = 'pass' | 'fail'

export type HistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type Round = {
  round: number
  madeOn: string | null
  sentOn: string | null
  sentVia: string | null
  feedback: string | null
  feedbackOn: string | null
  result: 'approved' | 'changes' | null
  by: string | null
  trialId?: string | null
  trialCode?: string | null
}

export type IngredientRef = { productId: string; code: string | null; name: string }

export type RdRequest = {
  id: string
  code: string
  kind: 'client' | 'npd'
  status: RequestStatus
  customerId: string | null
  customerName: string | null
  orderId: string | null
  orderNo: string | null
  productName: string
  brand: string | null
  productType: string | null
  ingredients: string | null
  texture: string | null
  fragrance: string | null
  colour: string | null
  packSize: string | null
  notes: string | null
  dueDate: string | null
  assignedName: string | null
  requestedByName: string | null
  clientInstruction: string | null
  textureReference: string | null
  targetPh: string | null
  claims: string | null
  sampleQty: string | null
  ingredientRefs: IngredientRef[]
  approvedTrialId: string | null
  bomId: string | null
  bomProductId: string | null
  rounds: Round[]
  lastSentOn: string | null
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}

export type FormulaLine = {
  id: string
  phase: string | null
  productId: string | null
  code: string | null
  name: string
  function: string | null
  percent: number
  isBalance: boolean
  note: string | null
  quantity?: number | null
}

export type Observations = { values: Record<string, string>; result: PassFail | null; remarks: string | null; by: string | null; at: string | null }
export type Reading = { condition: string; day: number; date: string; values: Record<string, string>; result: PassFail; remarks: string | null; by: string | null; at: string }
export type Stability = { startDate: string | null; conditions: string[]; checkpoints: number[]; readings: Reading[]; conclusion: string | null }

export type Trial = {
  id: string
  requestId: string
  code: string
  trialNo: number
  status: TrialStatus
  batchDate: string | null
  chemistName: string | null
  batchSize: number | null
  batchUnit: 'g' | 'kg' | 'ml' | 'l'
  aim: string | null
  procedure: string | null
  formula: FormulaLine[]
  totals: { fixed: number; balance: number; total: number; balanceCount: number }
  observations: Observations | null
  stability: Stability | null
  stabilityStatus: StabilityStatus
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}

export type TrialAction = 'submit' | 'record_result' | 'start_stability' | 'record_reading' | 'finish_stability' | 'approve' | 'reject' | 'reopen' | 'make_bom'
