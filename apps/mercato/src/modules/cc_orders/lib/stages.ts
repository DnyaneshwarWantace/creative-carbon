export type StageFieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea'

export type StageField = {
  key: string
  label: string
  type: StageFieldType
  options?: string[]
  listKey?: string
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

export const STAGE_DAY_LIMIT: Record<string, number> = {
  advance: 7,
  allocation: 5,
  qc: 3,
  packing: 2,
  invoice: 2,
  dispatch: 2,
}

export const DEFAULT_REOPEN_HOURS = 24

export const STOCK_STAGES = ['dispatch']

export const STAGE_WORK_FEATURE: Record<string, string> = {
  order: 'cc_orders.manage',
  advance: 'cc_orders.work.accounts',
  allocation: 'cc_orders.work.store',
  qc: 'cc_orders.work.qc',
  packing: 'cc_orders.work.dispatch',
  invoice: 'cc_orders.work.accounts',
  dispatch: 'cc_orders.work.dispatch',
}

export function stageWorkFeature(stageKey: string): string {
  return STAGE_WORK_FEATURE[stageKey] ?? 'cc_orders.stages'
}

export type StageDocument = { key: string; label: string; hint: string; required?: 'always' | 'eway' }

export const EWAY_BILL_LIMIT = 50000

export const STAGE_DOCUMENTS: Record<string, StageDocument[]> = {
  order: [{ key: 'customer_po', label: 'Customer PO', hint: 'The purchase order or order email the customer sent.' }],
  advance: [{ key: 'payment_proof', label: 'Payment proof / LC copy', hint: 'Bank or UPI screenshot of the advance, or the letter of credit for an export order.' }],
  qc: [
    { key: 'test_report', label: 'Test report', hint: 'Mechanical / electrical test report to the standard the customer asked for.' },
  ],
  packing: [{ key: 'packing_photo', label: 'Packing photo', hint: 'Photo of the packed pallets or PP-wrapped bundles.' }],
  invoice: [{ key: 'invoice_copy', label: 'Invoice and packing list', hint: 'Signed invoice and packing list as sent with the goods.' }],
  dispatch: [
    { key: 'lr_copy', label: 'LR / bill of lading', hint: 'Lorry receipt from the transporter, or the bill of lading for a container.', required: 'always' },
    { key: 'eway_bill', label: 'E-way bill', hint: `Needed when the goods are worth more than ₹${EWAY_BILL_LIMIT.toLocaleString('en-IN')}.`, required: 'eway' },
  ],
}

export function stageDocuments(stageKey: string, override?: StageOverride | null): StageDocument[] {
  return applyDocumentOverride(stageKey, override ?? activeOverridesFor(stageKey))
}

function activeOverridesFor(stageKey: string): StageOverride | null {
  return currentOverrides().get(stageKey) ?? null
}

export function documentRecordId(orderId: string, stageKey: string, documentKey: string): string {
  return `${orderId}:${stageKey}:${documentKey}`
}

export const HOLD_PARTIES = ['Customer side', 'Internal', 'Vendor']

export const PACK_TYPES = ['Pallet (export)', 'PP wrap + LDP stitch (local)']

export const STAGES: StageDef[] = [
  {
    key: 'order',
    label: 'Order booked',
    department: 'Sales',
    group: 'sales',
    hint: 'Grade, weave, sheet size, thickness and kg agreed with the customer. Rates locked.',
    after: [],
    steps: [],
    fields: [{ key: 'remarks', label: 'Remarks', type: 'textarea' }],
  },
  {
    key: 'advance',
    label: 'Advance / LC',
    department: 'Accounts',
    group: 'accounts',
    hint: 'Proforma sent and advance received, or the letter of credit opened for an export order. Skip for customers on credit.',
    after: ['order'],
    canSkip: true,
    steps: [
      { key: 'pi_sent', label: 'Proforma invoice sent to the customer' },
      { key: 'advance_received', label: 'Advance received / LC opened' },
    ],
    fields: [
      { key: 'pi_number', label: 'Proforma invoice no.', type: 'text' },
      { key: 'advance_percent', label: 'Advance %', type: 'number' },
      { key: 'advance_amount', label: 'Advance amount', type: 'number', required: true },
      { key: 'received_on', label: 'Received on', type: 'date', required: true },
      { key: 'payment_ref', label: 'Payment reference / UTR', type: 'text' },
      { key: 'lc_number', label: 'LC no. (export)', type: 'text' },
      { key: 'lc_expiry', label: 'LC expiry', type: 'date' },
    ],
  },
  {
    key: 'allocation',
    label: 'Stock allocation',
    department: 'FG store',
    group: 'store',
    hint: 'Finished lots of the right grade, size and thickness set aside for this order, oldest first. Whatever is short goes on the production plan.',
    after: ['advance'],
    steps: [
      { key: 'checked', label: 'Finished stock checked' },
      { key: 'allocated', label: 'Lots allocated to the order' },
      { key: 'shortfall', label: 'Shortfall sent to production', optional: true },
      { key: 'ready', label: 'All goods ready' },
    ],
    fields: [
      { key: 'allocation_status', label: 'Allocation', type: 'select', options: ['All from stock', 'Part from stock', 'To be made'], listKey: 'allocation_status', required: true },
      { key: 'ready_on', label: 'Goods ready on', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'qc',
    label: 'QC & test report',
    department: 'QC & lab',
    group: 'qc',
    hint: 'Thickness and FG inspection passed for the allocated lots, and the customer tests done and reported.',
    after: ['allocation'],
    steps: [
      { key: 'thickness', label: 'Thickness inspection passed' },
      { key: 'fg_inspection', label: 'FG inspection passed' },
      { key: 'tests', label: 'Customer tests done', optional: true },
      { key: 'report_sent', label: 'Test report sent to the customer', optional: true },
    ],
    fields: [
      { key: 'standard', label: 'Standard', type: 'select', options: ['IS 2036', 'NEMA', 'IEC', 'BIS', 'Customer spec'], listKey: 'test_standards' },
      { key: 'report_no', label: 'Test report no.', type: 'text' },
      { key: 'tested_on', label: 'Tested on', type: 'date' },
      { key: 'remarks', label: 'QC remarks', type: 'textarea' },
    ],
  },
  {
    key: 'packing',
    label: 'Packing & weighment',
    department: 'Despatch',
    group: 'dispatch',
    hint: 'Every sheet weighed (three decimals) and packed: pallets for export, PP wrap with LDP stitch for local.',
    after: ['qc'],
    steps: [
      { key: 'weighed', label: 'Sheets weighed' },
      { key: 'packed', label: 'Packed' },
      { key: 'marked', label: 'Marked and labelled', optional: true },
    ],
    fields: [
      { key: 'pack_type', label: 'Packing', type: 'select', options: PACK_TYPES, listKey: 'pack_types', required: true },
      { key: 'packages', label: 'Pallets / bundles', type: 'number' },
      { key: 'net_kg', label: 'Net weight (kg)', type: 'number', required: true },
      { key: 'gross_kg', label: 'Gross weight (kg)', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'invoice',
    label: 'Invoice & documents',
    department: 'Accounts',
    group: 'accounts',
    hint: 'Invoice, packing list, e-way bill and IRN made from the order and its weights; shipping bill for export.',
    after: ['packing'],
    steps: [
      { key: 'invoice', label: 'Invoice made' },
      { key: 'packing_list', label: 'Packing list made' },
      { key: 'eway', label: 'E-way bill made', optional: true },
      { key: 'shipping_bill', label: 'Shipping bill filed (export)', optional: true },
    ],
    fields: [
      { key: 'invoice_number', label: 'Invoice no.', type: 'text', required: true },
      { key: 'invoice_date', label: 'Invoice date', type: 'date', required: true },
      { key: 'eway_bill_no', label: 'E-way bill no.', type: 'text' },
      { key: 'irn', label: 'IRN', type: 'text' },
      { key: 'shipping_bill_no', label: 'Shipping bill no.', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    key: 'dispatch',
    label: 'Despatch',
    department: 'Despatch',
    group: 'dispatch',
    hint: 'Goods loaded and sent; stock goes out by lot.',
    after: ['invoice'],
    steps: [
      { key: 'loaded', label: 'Loaded' },
      { key: 'dispatched', label: 'Goods despatched' },
      { key: 'delivered', label: 'Delivered to the customer', optional: true },
    ],
    fields: [
      { key: 'dispatch_date', label: 'Despatch date', type: 'date', required: true },
      { key: 'transporter', label: 'Transporter', type: 'text', listKey: 'transporters' },
      { key: 'vehicle_no', label: 'Vehicle no.', type: 'text', placeholder: 'GJ 07 AB 1234' },
      { key: 'lr_number', label: 'LR / BL no.', type: 'text' },
      { key: 'container_no', label: 'Container no.', type: 'text' },
      { key: 'seal_no', label: 'Seal no.', type: 'text' },
      { key: 'port', label: 'Port', type: 'select', options: ['Mundra', 'Kandla', 'Nhava Sheva'], listKey: 'ports' },
      { key: 'delivered_on', label: 'Delivered on', type: 'date' },
      { key: 'dispatch_override', label: 'Despatch before full payment: reason', type: 'textarea', placeholder: 'Only if money is still due, e.g. owner approved, 30 days credit' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
]

export const STAGE_KEYS = STAGES.map((stage) => stage.key)

export type StageOverride = {
  stageKey: string
  label?: string | null
  dayLimit?: number | null
  reopenHours?: number | null
  hiddenSteps?: string[] | null
  requiredFields?: string[] | null
  extraFields?: StageField[] | null
  documents?: Record<string, 'always' | 'optional'> | null
  extraDocuments?: Array<{ key: string; label: string; required: boolean }> | null
  sharedFields?: string[] | null
}

export const DEFAULT_SHARED_FIELDS: Record<string, string[]> = {
  advance: ['received_on'],
  allocation: ['allocation_status', 'ready_on'],
  qc: ['standard', 'report_no', 'tested_on'],
  packing: ['pack_type', 'packages', 'net_kg', 'gross_kg'],
  invoice: ['invoice_number', 'invoice_date'],
  dispatch: ['dispatch_date', 'transporter', 'lr_number', 'container_no', 'port', 'delivered_on'],
}

export function sharedFieldKeys(stageKey: string, override?: StageOverride | null): Set<string> {
  return new Set(override?.sharedFields ?? DEFAULT_SHARED_FIELDS[stageKey] ?? [])
}

export const LOCKED_STEPS: Record<string, string[]> = {
  allocation: ['allocated'],
  packing: ['weighed', 'packed'],
  invoice: ['invoice'],
  dispatch: ['dispatched'],
}

export const EXTRA_FIELD_TYPES: StageFieldType[] = ['text', 'number', 'date', 'textarea', 'select']

export function applyStageOverride(def: StageDef, override?: StageOverride | null): StageDef {
  if (!override) return def
  const locked = LOCKED_STEPS[def.key] ?? []
  const hidden = new Set((override.hiddenSteps ?? []).filter((key) => !locked.includes(key)))
  const required = new Set(override.requiredFields ?? [])
  const baseKeys = new Set(def.fields.map((field) => field.key))
  const extras = (override.extraFields ?? []).filter((field) => !baseKeys.has(field.key))
  return {
    ...def,
    label: override.label?.trim() || def.label,
    steps: def.steps.filter((step) => !hidden.has(step.key)),
    fields: [...def.fields.map((field) => (required.has(field.key) && !field.required ? { ...field, required: true } : field)), ...extras],
  }
}

export function applyDocumentOverride(stageKey: string, override?: StageOverride | null): StageDocument[] {
  const base = STAGE_DOCUMENTS[stageKey] ?? []
  if (!override) return base
  const modes = override.documents ?? {}
  const own = base.map((doc) => {
    if (doc.required === 'eway') return doc
    const mode = modes[doc.key]
    if (mode === 'always') return { ...doc, required: 'always' as const }
    if (mode === 'optional') return { key: doc.key, label: doc.label, hint: doc.hint }
    return doc
  })
  const extra = (override.extraDocuments ?? [])
    .filter((doc) => !base.some((entry) => entry.key === doc.key))
    .map((doc) => ({ key: doc.key, label: doc.label, hint: '', ...(doc.required ? { required: 'always' as const } : {}) }))
  return [...own, ...extra]
}

export function applyDayLimit(stageKey: string, override?: StageOverride | null): number | undefined {
  const value = override?.dayLimit
  return typeof value === 'number' && value > 0 ? value : STAGE_DAY_LIMIT[stageKey]
}

let activeOverrides = new Map<string, StageOverride>()
let overrideResolver: (() => Map<string, StageOverride> | null) | null = null

export function setStageOverrides(list: StageOverride[]): void {
  activeOverrides = new Map(list.map((entry) => [entry.stageKey, entry]))
}

export function setStageOverrideResolver(resolver: () => Map<string, StageOverride> | null): void {
  overrideResolver = resolver
}

function currentOverrides(): Map<string, StageOverride> {
  return overrideResolver?.() ?? activeOverrides
}

export function stageDef(key: string): StageDef | undefined {
  const base = STAGES.find((stage) => stage.key === key)
  return base ? applyStageOverride(base, currentOverrides().get(key)) : undefined
}

export function stageList(): StageDef[] {
  return STAGES.map((stage) => applyStageOverride(stage, currentOverrides().get(stage.key)))
}

export function applyReopenHours(override?: StageOverride | null): number {
  const value = override?.reopenHours
  return typeof value === 'number' && value >= 0 ? value : DEFAULT_REOPEN_HOURS
}

export function stageReopenHours(key: string): number {
  return applyReopenHours(currentOverrides().get(key))
}

export function stageDayLimit(key: string): number | undefined {
  return applyDayLimit(key, currentOverrides().get(key))
}

export type StageStatus = 'waiting' | 'open' | 'on_hold' | 'done' | 'skipped'

export type ReopenInfo = { until: string | null; stockMoved: boolean; nextStarted: string[]; orderClosed: boolean }

function reopenTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function reopenBlock(info: ReopenInfo, now = Date.now()): string | null {
  if (info.orderClosed) return 'The order is already closed.'
  if (info.stockMoved) return 'Stock was already moved when this stage was done.'
  if (!info.until) return 'This stage cannot be reopened by the department once it is done.'
  if (Date.parse(info.until) < now) return `The time to reopen it ended on ${reopenTime(info.until)}.`
  if (info.nextStarted.length) return `${info.nextStarted.join(', ')} already started work on it.`
  return null
}

export function reopenLeftText(info: ReopenInfo, now = Date.now()): string | null {
  if (!info.until) return null
  const left = Date.parse(info.until) - now
  if (left <= 0) return null
  const hours = Math.floor(left / 3600000)
  if (hours >= 1) return `${hours} h left`
  return `${Math.max(1, Math.ceil(left / 60000))} min left`
}

export function reopenUntilText(info: ReopenInfo): string | null {
  return info.until ? reopenTime(info.until) : null
}

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

export type OrderHeadline = 'booked' | 'confirmed' | 'updated' | 'completed' | 'delivered' | 'cancelled'

export function orderHeadline(status: string, revisedAt: Date | string | null | undefined, dispatchData: Record<string, unknown> | null | undefined): OrderHeadline {
  if (status === 'cancelled') return 'cancelled'
  if (typeof dispatchData?.delivered_on === 'string' && dispatchData.delivered_on) return 'delivered'
  if (status === 'completed') return 'completed'
  if (revisedAt) return 'updated'
  return status === 'booked' ? 'booked' : 'confirmed'
}
