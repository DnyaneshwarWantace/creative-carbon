export type StageFieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea'

export type StageField = {
  key: string
  label: string
  type: StageFieldType
  options?: string[]
  required?: boolean
  placeholder?: string
}

export type StageStep = { key: string; label: string; optional?: boolean }

export type StageDef = {
  key: string
  label: string
  department: string
  group: string
  hint: string
  after: string[]
  canSkip?: boolean
  steps: StageStep[]
  fields: StageField[]
}

export const DESIGNER_STATUSES = ['ORDERED', 'PM OK', 'Client Side', 'Artwork', 'Half PM OK', 'Hold', 'Need to Order PM']

export const HOLD_PARTIES = ['Client side', 'Internal', 'Vendor']

export const STAGES: StageDef[] = [
  {
    key: 'order',
    label: 'Order booked',
    department: 'Sales',
    group: 'sales',
    hint: 'Products, quantities and specs agreed with the client. Prices locked.',
    after: [],
    steps: [],
    fields: [{ key: 'remarks', label: 'Remarks', type: 'textarea' }],
  },
  {
    key: 'advance',
    label: 'Advance received',
    department: 'Accounts',
    group: 'accounts',
    hint: 'The order becomes official the day the advance arrives.',
    after: ['order'],
    steps: [
      { key: 'pi_sent', label: 'Proforma invoice sent to client' },
      { key: 'advance_received', label: 'Advance received in bank' },
    ],
    fields: [
      { key: 'pi_number', label: 'Proforma invoice no.', type: 'text' },
      { key: 'advance_percent', label: 'Advance %', type: 'number', placeholder: '40' },
      { key: 'advance_amount', label: 'Advance amount (₹)', type: 'number', required: true },
      { key: 'received_on', label: 'Received on', type: 'date', required: true },
      { key: 'payment_ref', label: 'Payment reference / UTR', type: 'text' },
    ],
  },
  {
    key: 'sampling',
    label: 'Sampling / R&D',
    department: 'R&D',
    group: 'rnd',
    hint: 'Sample made after the order, tracked by R&D number. Skip for a repeat order.',
    after: ['advance'],
    canSkip: true,
    steps: [
      { key: 'request', label: 'R&D request received (brand, ingredients, texture, fragrance, colour)' },
      { key: 'sample_made', label: 'Sample made' },
      { key: 'sample_sent', label: 'Sample sent to client' },
      { key: 'client_ok', label: 'Client approved the sample' },
    ],
    fields: [
      { key: 'rd_number', label: 'R&D no.', type: 'text', required: true },
      { key: 'sample_name', label: 'Sample name', type: 'text' },
      { key: 'sample_sent_on', label: 'Sample sent on', type: 'date' },
      { key: 'client_feedback', label: 'Client feedback', type: 'select', options: ['Approved', 'Changes needed', 'Waiting'], required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'artwork',
    label: 'Artwork & packaging',
    department: 'Artwork & PM',
    group: 'artwork',
    hint: 'Design, client approval, QA finalise, packing material ordered and received. Runs side by side with the formula.',
    after: ['sampling'],
    steps: [
      { key: 'design', label: 'Artwork designed' },
      { key: 'client_approved', label: 'Client approved the artwork' },
      { key: 'qa_final', label: 'QA finalised the artwork' },
      { key: 'pm_ordered', label: 'Packing material ordered' },
      { key: 'pm_ok', label: 'Packing material received (PM OK)' },
    ],
    fields: [
      { key: 'designer_status', label: 'Designer status', type: 'select', options: DESIGNER_STATUSES, required: true },
      { key: 'status_note', label: 'Status note', type: 'text', placeholder: 'e.g. Artwork under process' },
      { key: 'artwork_approved_on', label: 'Artwork approved on', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'formulation',
    label: 'Formula & BOM',
    department: 'R&D',
    group: 'rnd',
    hint: 'Every product in the order needs an approved BOM. Runs side by side with artwork.',
    after: ['sampling'],
    steps: [],
    fields: [{ key: 'remarks', label: 'Remarks', type: 'textarea' }],
  },
  {
    key: 'planning',
    label: 'Material planning',
    department: 'Planning',
    group: 'planning',
    hint: 'Raw and packing material checked against stock; purchase raised for what is short; received material QC-approved. Runs in the formula arm, alongside artwork.',
    after: ['formulation'],
    steps: [
      { key: 'checked', label: 'Material checked against stock' },
      { key: 'reserved', label: 'Stock reserved for this order' },
      { key: 'purchase', label: 'Purchase raised for what is short', optional: true },
      { key: 'received', label: 'Material received and QC approved', optional: true },
    ],
    fields: [
      { key: 'material_status', label: 'Material status', type: 'select', options: ['All available', 'Purchase raised', 'Waiting for material'], required: true },
      { key: 'planned_for', label: 'Planned for (week of)', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    department: 'Production',
    group: 'production',
    hint: 'Bulk made in the vessel. Unit: kg / ml. Starts only when both arms are ready. Ask the RM store for the material and confirm you received it; the QC team tests the bulk (chemical and micro) before this can be done.',
    after: ['planning', 'artwork'],
    steps: [
      { key: 'manufactured', label: 'Manufacturing done' },
    ],
    fields: [
      { key: 'bulk_source', label: 'Bulk', type: 'select', options: ['Make a new batch', 'Use bulk already made'] },
      { key: 'batch_no', label: 'Batch no.', type: 'text', required: true },
      { key: 'batch_size', label: 'Bulk made / taken (kg)', type: 'number', required: true },
      { key: 'mfg_date', label: 'Mfg. date', type: 'date', required: true },
      { key: 'shift', label: 'Shift', type: 'select', options: ['A', 'B', 'C', 'General'] },
      { key: 'machine', label: 'Vessel / machine', type: 'text' },
      { key: 'operator', label: 'Operator', type: 'text' },
      { key: 'start_time', label: 'Started at', type: 'time' },
      { key: 'end_time', label: 'Finished at', type: 'time' },
      { key: 'wastage_kg', label: 'Wastage (kg)', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'filling',
    label: 'Filling',
    department: 'Production',
    group: 'production',
    hint: 'Bulk filled into bottles / tubes / jars. Unit: bottles / gm / ml. Ask the PM store for bottles, tubes and caps and confirm you received them. QC after filling only if its QC rule is switched on.',
    after: ['manufacturing'],
    steps: [
      { key: 'filled', label: 'Filling done' },
    ],
    fields: [
      { key: 'filled_units', label: 'Units filled', type: 'number', required: true },
      { key: 'rejected_units', label: 'Rejected units', type: 'number' },
      { key: 'filling_date', label: 'Filling date', type: 'date' },
      { key: 'shift', label: 'Shift', type: 'select', options: ['A', 'B', 'C', 'General'] },
      { key: 'machine', label: 'Filling machine', type: 'text' },
      { key: 'operator', label: 'Operator', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'packing',
    label: 'Packing',
    department: 'Production',
    group: 'production',
    hint: 'Finished goods packed. Unit: pieces. Ask the PM store for cartons, labels and the sample kit and confirm you received them. The QC team does the final QC before this can be done.',
    after: ['filling'],
    steps: [
      { key: 'sample', label: 'Sample of the finished good made' },
      { key: 'packed', label: 'All packaging done' },
    ],
    fields: [
      { key: 'packed_qty', label: 'Packed quantity (pcs)', type: 'number', required: true },
      { key: 'packed_on', label: 'Packed on', type: 'date' },
      { key: 'shippers', label: 'Shipper boxes', type: 'number' },
      { key: 'location', label: 'Kept at (factory location)', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'qc_qa',
    label: 'QA release',
    department: 'QA',
    group: 'qa',
    hint: 'QA reviews the batch record, materials and every QC result, checks retention samples, then releases, reworks or rejects the batch.',
    after: ['packing'],
    steps: [
      { key: 'line_clearance', label: 'Line clearance checked for manufacturing, filling and packing' },
      { key: 'documents', label: 'Batch manufacturing record complete and reviewed' },
      { key: 'materials', label: 'Store issues and returns reconciled, yield checked' },
      { key: 'qc_review', label: 'Every QC check reviewed (bulk, filling, finished goods)' },
      { key: 'retention', label: 'Retention sample of finished goods kept' },
      { key: 'released', label: 'Decision signed' },
    ],
    fields: [
      { key: 'qc_result', label: 'QA decision', type: 'select', options: ['Released', 'Rework', 'Rejected'], required: true },
      { key: 'released_on', label: 'Decision date', type: 'date', required: true },
      { key: 'coa_no', label: 'COA no.', type: 'text', placeholder: 'e.g. COA/57001' },
      { key: 'retention_qty', label: 'Retention sample (pcs)', type: 'number' },
      { key: 'retention_location', label: 'Retention sample kept at', type: 'text', placeholder: 'e.g. QA retention cabinet R2' },
      { key: 'remarks', label: 'QA remarks', type: 'textarea' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing & payment',
    department: 'Accounts',
    group: 'accounts',
    hint: 'Invoice raised and the balance payment received.',
    after: ['qc_qa'],
    steps: [
      { key: 'invoice', label: 'Invoice raised' },
      { key: 'balance', label: 'Balance payment received' },
    ],
    fields: [
      { key: 'invoice_number', label: 'Invoice no.', type: 'text', required: true },
      { key: 'invoice_date', label: 'Invoice date', type: 'date', required: true },
      { key: 'balance_status', label: 'Balance payment', type: 'select', options: ['Received', 'Pending'], required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    department: 'Dispatch',
    group: 'dispatch',
    hint: 'Goods sent to the client and delivered.',
    after: ['billing'],
    steps: [
      { key: 'dispatched', label: 'Goods dispatched' },
      { key: 'delivered', label: 'Delivered to client', optional: true },
    ],
    fields: [
      { key: 'dispatch_date', label: 'Dispatch date', type: 'date', required: true },
      { key: 'transporter', label: 'Transporter', type: 'text' },
      { key: 'lr_number', label: 'LR / docket no.', type: 'text' },
      { key: 'delivered_on', label: 'Delivered on', type: 'date' },
      { key: 'dispatch_override', label: 'Dispatch before full payment: reason', type: 'textarea', placeholder: 'Only if money is still due, e.g. owner approved, 30 days credit' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
]

export const STAGE_KEYS = STAGES.map((stage) => stage.key)

export function stageDef(key: string): StageDef | undefined {
  return STAGES.find((stage) => stage.key === key)
}

export type StageStatus = 'waiting' | 'open' | 'on_hold' | 'done' | 'skipped'

export function isFinished(status: string | undefined): boolean {
  return status === 'done' || status === 'skipped'
}

export function missingRequired(def: StageDef, data: Record<string, unknown>): string[] {
  return def.fields.filter((field) => field.required && (data[field.key] === undefined || data[field.key] === null || String(data[field.key]).trim() === '')).map((field) => field.label)
}

export function financialYear(date: Date): string {
  const year = date.getFullYear()
  const start = date.getMonth() >= 3 ? year : year - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

export type StepState = { done: boolean; at: string | null; by: string | null }

export function stepStates(data: Record<string, unknown> | null | undefined): Record<string, StepState> {
  const raw = (data ?? {}).__steps
  return raw && typeof raw === 'object' ? (raw as Record<string, StepState>) : {}
}

export function missingSteps(def: StageDef, data: Record<string, unknown> | null | undefined): string[] {
  const states = stepStates(data)
  return def.steps.filter((step) => !step.optional && !states[step.key]?.done).map((step) => step.label)
}

export type WorkState = 'coming' | 'pending' | 'in_progress' | 'on_hold' | 'completed' | 'skipped'

export function workState(status: string, data: Record<string, unknown> | null | undefined): WorkState {
  if (status === 'done') return 'completed'
  if (status === 'skipped') return 'skipped'
  if (status === 'on_hold') return 'on_hold'
  if (status !== 'open') return 'coming'
  return data && data.__started ? 'in_progress' : 'pending'
}

export const WORK_STATE_LABEL: Record<WorkState, string> = {
  coming: 'Coming',
  pending: 'Pending',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  skipped: 'Skipped',
}

export const QA_ARTWORK_CHECKS = [
  { key: 'product_name', label: 'Product name and variant match the order' },
  { key: 'inci', label: 'INCI / ingredient list matches the approved formula' },
  { key: 'mrp_block', label: 'MRP block and net quantity correct' },
  { key: 'batch_area', label: 'Space for batch no., mfg and expiry date' },
  { key: 'legal', label: 'Legal text: manufacturer, licence no., address, customer care' },
  { key: 'barcode', label: 'Barcode readable and correct' },
] as const
