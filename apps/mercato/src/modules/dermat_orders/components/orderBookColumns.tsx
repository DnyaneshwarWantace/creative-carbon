import * as React from 'react'
import { isMoneyStageField } from '../lib/moneyFields'
import type { ReopenInfo } from '../lib/stages'
import { cn } from '@open-mercato/shared/lib/utils'
import { STAGES, WORK_STATE_LABEL, stageDef, workState, type StageFieldType, type WorkState } from '../lib/stages'
import { LINE_SPEC_SECTIONS } from '../lib/specs'
import { formatDate, formatQty } from './format'
import { paymentTermLabel } from '../../dermat_lists/lib/paymentTerms'
import type { EditOption } from '../../dermat_products/components/EditField'

export type SheetStage = {
  status: 'waiting' | 'open' | 'on_hold' | 'done' | 'skipped'
  days: number | null
  openedAt: string | null
  completedAt: string | null
  completedByName: string | null
  responsibleName: string | null
  stepsDone: number
  stepsTotal: number
  started: boolean
  reopen?: ReopenInfo
  fields: Record<string, string | number | null>
}

export type SheetLine = {
  id: string
  productId: string
  productCode: string | null
  productTitle: string
  brandName: string | null
  packSize: string | null
  mrp: number | null
  quantity: number
  rate: number | null
  gstPercent: number
  discountPercent: number
  total: number
  batchNo: string | null
  specs: Record<string, Record<string, string>>
}

export type SheetOrder = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  orderType: 'new' | 'repeat' | 'revision'
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled'
  customerId: string
  customerName: string
  customerPhone: string | null
  customerPoRef: string | null
  salesManager: string | null
  paymentTerms: string | null
  paymentRemarks: string | null
  productRemarks: string | null
  billingRemarks: string | null
  packingRemarks: string | null
  updatedAt: string
  total: number
  received: number
  due: number
  late: boolean
  doneCount: number
  stageCount: number
  pm: { set: number; ok: number }
  current: Array<{ key: string; label: string; department: string; status: string; days: number | null; responsibleName: string | null; holdParty: string | null; holdReason: string | null; started: boolean }>
  stages: Record<string, SheetStage>
  lines: SheetLine[]
}

export type CellInput = { order: SheetOrder; line: SheetLine | null }

export type CellEdit = {
  kind: StageFieldType
  options?: EditOption[]
  listKey?: string
  target: 'order' | 'line' | 'spec' | 'stage'
  field: string
  section?: 'production' | 'primary' | 'secondary'
  stageKey?: string
  get: (input: CellInput) => string
  locked?: (input: CellInput) => string | null
}

export type SheetColumn = {
  key: string
  label: string
  section: string
  scope: 'order' | 'line'
  align?: 'right' | 'center'
  wide?: boolean
  money?: boolean
  render: (input: CellInput) => React.ReactNode
  edit?: CellEdit
}

function closed(order: SheetOrder): string | null {
  if (order.status === 'cancelled') return 'This order is cancelled'
  if (order.status === 'completed') return 'This order is closed'
  return null
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

export function orderEdit(field: string, kind: StageFieldType = 'text', options?: EditOption[], listKey?: string): CellEdit {
  return { kind, options, listKey, target: 'order', field, get: ({ order }) => asText((order as unknown as Record<string, unknown>)[field]), locked: ({ order }) => closed(order) }
}

export function lineEdit(field: keyof SheetLine, kind: StageFieldType = 'text', options?: EditOption[]): CellEdit {
  return {
    kind,
    options,
    target: 'line',
    field,
    get: ({ line }) => asText(line?.[field]),
    locked: ({ order, line }) => {
      if (!line) return 'No product on this row'
      if (field === 'quantity' && ['done', 'skipped'].includes(order.stages.manufacturing?.status ?? '')) return 'Manufacturing is done — quantity is locked'
      return closed(order)
    },
  }
}

export function specEdit(section: 'production' | 'primary' | 'secondary', field: string, options?: string[], listKey?: string): CellEdit {
  return {
    kind: options ? 'select' : 'text',
    options,
    listKey,
    target: 'spec',
    section,
    field,
    get: ({ line }) => asText(line?.specs?.[section]?.[field]),
    locked: ({ order, line }) => (line ? closed(order) : 'No product on this row'),
  }
}

export function stageEdit(stageKey: string, field: string): CellEdit | undefined {
  const def = stageDef(stageKey)?.fields.find((entry) => entry.key === field)
  if (!def) return undefined
  return {
    kind: def.type,
    options: def.options,
    listKey: def.listKey,
    target: 'stage',
    stageKey,
    field,
    get: ({ order }) => asText(order.stages[stageKey]?.fields[field]),
    locked: ({ order }) => {
      const status = order.stages[stageKey]?.status ?? 'waiting'
      const label = stageDef(stageKey)?.label ?? stageKey
      if (closed(order)) return closed(order)
      if (status === 'waiting') return `${label} has not started yet`
      if (status === 'done' || status === 'skipped') return `${label} is finished — reopen it to change`
      return null
    },
  }
}

const TYPE_LABEL: Record<SheetOrder['orderType'], string> = { new: 'NEW', repeat: 'REPEAT', revision: 'REVISION' }

export const WORK_STATE_TONE: Record<WorkState, string> = {
  coming: 'bg-muted text-muted-foreground',
  pending: 'bg-status-warning-bg text-status-warning-text',
  in_progress: 'bg-status-info-bg text-status-info-text',
  on_hold: 'bg-status-error-bg text-status-error-text',
  completed: 'bg-status-success-bg text-status-success-text',
  skipped: 'bg-muted text-muted-foreground',
}

const SEGMENT_TONE: Record<WorkState, string> = {
  coming: 'bg-muted',
  pending: 'bg-status-warning-icon',
  in_progress: 'bg-status-info-icon',
  on_hold: 'bg-status-error-icon',
  completed: 'bg-status-success-icon',
  skipped: 'bg-muted-foreground/40',
}

export function sheetWorkState(stage: SheetStage | undefined): WorkState {
  if (!stage) return 'coming'
  return workState(stage.status, stage.started ? { __started: true } : null)
}

function dash(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>
  return String(value)
}

function money(value: number | null | undefined): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
}

function perUnit(line: SheetLine | null): React.ReactNode {
  if (!line?.mrp || !line.packSize) return <span className="text-muted-foreground">—</span>
  const size = Number.parseFloat(line.packSize.replace(',', '.'))
  if (!Number.isFinite(size) || size <= 0) return <span className="text-muted-foreground">—</span>
  return `₹${formatQty(line.mrp / size, 2)}`
}

function field(order: SheetOrder, stageKey: string, key: string): string | number | null {
  return order.stages[stageKey]?.fields[key] ?? null
}

export function StatePill({ state, label }: { state: WorkState; label?: string }) {
  return <span className={cn('inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium', WORK_STATE_TONE[state])}>{label ?? WORK_STATE_LABEL[state]}</span>
}

export function StageTrack({ order }: { order: SheetOrder }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${order.doneCount} of ${order.stageCount} stages done`}>
      {STAGES.map((def) => {
        const state = sheetWorkState(order.stages[def.key])
        return <span key={def.key} title={`${def.label}: ${WORK_STATE_LABEL[state]}`} className={cn('h-2.5 w-2.5 rounded-sm', SEGMENT_TONE[state])} />
      })}
      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
        {order.doneCount}/{order.stageCount}
      </span>
    </span>
  )
}

const BASE_COLUMNS: SheetColumn[] = [
  { key: 'orderDate', label: 'O.Date', section: 'Core identifiers', scope: 'order', render: ({ order }) => formatDate(order.orderDate) },
  { key: 'orderType', label: 'Packaging (New / Repeat)', section: 'Core identifiers', scope: 'order', edit: orderEdit('orderType', 'select', [{ value: 'new', label: 'NEW' }, { value: 'repeat', label: 'REPEAT' }, { value: 'revision', label: 'REVISION' }]), render: ({ order }) => TYPE_LABEL[order.orderType] },
  { key: 'productCode', label: 'Product ID', section: 'Core identifiers', scope: 'line', render: ({ line }) => <span className="font-mono">{dash(line?.productCode)}</span> },
  { edit: lineEdit('packSize'), key: 'packSize', label: 'Pack (gm/ml)', section: 'Core identifiers', scope: 'line', render: ({ line }) => dash(line?.packSize) },
  { edit: lineEdit('quantity', 'number'), key: 'quantity', label: 'Order qty', section: 'Core identifiers', scope: 'line', align: 'right', render: ({ line }) => (line ? formatQty(line.quantity, 0) : dash(null)) },
  { edit: lineEdit('batchNo'), key: 'batchNo', label: 'Batch no.', section: 'Core identifiers', scope: 'line', render: ({ line }) => <span className="font-mono">{dash(line?.batchNo)}</span> },
  { edit: specEdit('production', 'mfg_month'), key: 'month', label: 'Month (Mfg.)', section: 'Core identifiers', scope: 'line', render: ({ line }) => dash(line?.specs?.production?.mfg_month) },
  { edit: lineEdit('mrp', 'number'), key: 'mrp', label: 'M.R.P. (₹)', section: 'Pricing & customer', scope: 'line', align: 'right', render: ({ line }) => money(line?.mrp) },
  { key: 'mrpPerUnit', label: 'MRP / g or ml', section: 'Pricing & customer', scope: 'line', align: 'right', render: ({ line }) => perUnit(line) },
  { edit: specEdit('production', 'expiry_month'), key: 'expiry', label: 'Expiry', section: 'Pricing & customer', scope: 'line', render: ({ line }) => dash(line?.specs?.production?.expiry_month) },
  { key: 'customer', label: 'Customer / Company', section: 'Pricing & customer', scope: 'order', wide: true, render: ({ order }) => <span className="font-medium">{dash(order.customerName)}</span> },
  { edit: orderEdit('customerPoRef'), key: 'customerPo', label: 'Customer PO', section: 'Pricing & customer', scope: 'order', render: ({ order }) => dash(order.customerPoRef) },
  {
    key: 'verified',
    label: 'Verified (advance)',
    section: 'Pricing & customer',
    scope: 'order',
    align: 'center',
    render: ({ order }) => {
      const state = sheetWorkState(order.stages.advance)
      return <StatePill state={state} label={state === 'completed' ? 'Yes' : state === 'skipped' ? 'Skipped' : WORK_STATE_LABEL[state]} />
    },
  },
  { edit: orderEdit('salesManager'), key: 'salesPoc', label: 'Sales POC', section: 'Pricing & customer', scope: 'order', render: ({ order }) => dash(order.salesManager) },
  { edit: orderEdit('deliveryDate', 'date'), key: 'delivery', label: 'Delivery', section: 'Pricing & customer', scope: 'order', render: ({ order }) => <span className={cn(order.late && 'font-semibold text-status-error-text')}>{order.deliveryDate ? formatDate(order.deliveryDate) : dash(null)}</span> },
  { edit: stageEdit('sampling', 'rd_number'), key: 'rdNo', label: 'R&D no.', section: 'R&D, QA & artwork', scope: 'order', render: ({ order }) => <span className="font-mono">{dash(field(order, 'sampling', 'rd_number') ?? null)}</span> },
  { edit: stageEdit('sampling', 'client_feedback'), key: 'sampleFeedback', label: 'Sample feedback', section: 'R&D, QA & artwork', scope: 'order', render: ({ order }) => dash(field(order, 'sampling', 'client_feedback')) },
  {
    key: 'artwork',
    label: 'Artwork finalized',
    section: 'R&D, QA & artwork',
    scope: 'order',
    render: ({ order }) => {
      const state = sheetWorkState(order.stages.artwork)
      return state === 'completed' ? <StatePill state="completed" label={`Yes${order.stages.artwork?.fields.artwork_approved_on ? ` · ${formatDate(String(order.stages.artwork.fields.artwork_approved_on))}` : ''}`} /> : <StatePill state={state} />
    },
  },
  { edit: stageEdit('qc_qa', 'qc_result'), key: 'qa', label: 'QA approval', section: 'R&D, QA & artwork', scope: 'order', render: ({ order }) => dash(field(order, 'qc_qa', 'qc_result')) },
  {
    key: 'printing',
    label: 'Sent to printing (PM ordered)',
    section: 'R&D, QA & artwork',
    scope: 'order',
    render: ({ order }) => {
      const stage = order.stages.artwork
      if (!stage) return dash(null)
      return stage.stepsDone >= 4 || stage.status === 'done' ? 'Yes' : 'No'
    },
  },
  { key: 'pmStock', label: 'Packing material (PM OK)', section: 'Packaging & material', scope: 'order', render: ({ order }) => (order.pm.set ? `${order.pm.ok} of ${order.pm.set} OK` : dash(null)) },
  { edit: stageEdit('planning', 'material_status'), key: 'materialStatus', label: 'Material status', section: 'Packaging & material', scope: 'order', render: ({ order }) => dash(field(order, 'planning', 'material_status')) },
  { edit: specEdit('primary', 'name'), key: 'primaryPkg', label: 'Primary packaging', section: 'Packaging & material', scope: 'line', render: ({ line }) => dash(line?.specs?.primary?.name) },
  { edit: lineEdit('rate', 'number'), money: true, key: 'rate', label: 'Billing rate (₹)', section: 'Commercials & remarks', scope: 'line', align: 'right', render: ({ line }) => money(line?.rate ?? null) },
  { key: 'gst', label: 'GST %', section: 'Commercials & remarks', scope: 'line', align: 'right', edit: lineEdit('gstPercent', 'select', ['0', '5', '12', '18', '28']), render: ({ line }) => (line ? `${formatQty(line.gstPercent, 0)}%` : dash(null)) },
  { money: true, key: 'discount', label: 'Discount %', section: 'Commercials & remarks', scope: 'line', align: 'right', edit: lineEdit('discountPercent', 'number'), render: ({ line }) => (line?.discountPercent ? `${formatQty(line.discountPercent, 2)}%` : dash(null)) },
  { money: true, key: 'lineTotal', label: 'Line total (₹)', section: 'Commercials & remarks', scope: 'line', align: 'right', render: ({ line }) => money(line?.total ?? null) },
  { money: true, key: 'orderTotal', label: 'Order value (₹)', section: 'Commercials & remarks', scope: 'order', align: 'right', render: ({ order }) => (order.total ? money(order.total) : dash(null)) },
  { money: true, key: 'received', label: 'Received (₹)', section: 'Commercials & remarks', scope: 'order', align: 'right', render: ({ order }) => money(order.received) },
  {
    key: 'due',
    money: true,
    label: 'Due (₹)',
    section: 'Commercials & remarks',
    scope: 'order',
    align: 'right',
    render: ({ order }) => (order.total ? <span className={cn(order.due > 0 && 'font-semibold text-status-warning-text')}>{money(order.due)}</span> : dash(null)),
  },
  { edit: orderEdit('billingRemarks', 'textarea'), key: 'billingRemarks', label: 'Billing remarks', section: 'Commercials & remarks', scope: 'order', wide: true, render: ({ order }) => <span className="block max-w-60 truncate">{dash(order.billingRemarks)}</span> },
  { edit: stageEdit('artwork', 'designer_status'), key: 'designerStatus', label: 'Designer status', section: 'Commercials & remarks', scope: 'order', render: ({ order }) => dash(field(order, 'artwork', 'designer_status')) },
  { edit: stageEdit('billing', 'invoice_number'), key: 'invoiceNo', label: 'Invoice no.', section: 'Commercials & remarks', scope: 'order', render: ({ order }) => dash(field(order, 'billing', 'invoice_number')) },
  { edit: stageEdit('dispatch', 'dispatch_date'), key: 'dispatchDate', label: 'Dispatched on', section: 'Commercials & remarks', scope: 'order', render: ({ order }) => (field(order, 'dispatch', 'dispatch_date') ? formatDate(String(field(order, 'dispatch', 'dispatch_date'))) : dash(null)) },
  { edit: orderEdit('paymentTerms', 'select', undefined, 'payment_terms'), key: 'paymentTerms', label: 'Payment terms', section: 'Commercials & remarks', scope: 'order', render: ({ order }) => dash(order.paymentTerms ? paymentTermLabel(order.paymentTerms) : null) },
  { edit: orderEdit('productRemarks', 'textarea'), key: 'productRemarks', label: 'Product remarks', section: 'Commercials & remarks', scope: 'order', wide: true, render: ({ order }) => <span className="block max-w-60 truncate">{dash(order.productRemarks)}</span> },
  { edit: orderEdit('packingRemarks', 'textarea'), key: 'packingRemarks', label: 'Packing remarks', section: 'Commercials & remarks', scope: 'order', wide: true, render: ({ order }) => <span className="block max-w-60 truncate">{dash(order.packingRemarks)}</span> },
  { key: 'track', label: 'All stages', section: 'Stage progress', scope: 'order', render: ({ order }) => <StageTrack order={order} /> },
]

const STAGE_STATUS_COLUMNS: SheetColumn[] = STAGES.filter((def) => def.key !== 'order').map((def) => ({
  key: `status:${def.key}`,
  label: def.label,
  section: 'Stage progress',
  scope: 'order' as const,
  render: ({ order }: CellInput) => {
    const stage = order.stages[def.key]
    const state = sheetWorkState(stage)
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatePill state={state} />
        {stage && (state === 'pending' || state === 'in_progress' || state === 'on_hold') && stage.days != null ? <span className="text-xs tabular-nums text-muted-foreground">{formatQty(stage.days, 1)} d</span> : null}
        {state === 'completed' && stage?.completedAt ? <span className="text-xs text-muted-foreground">{formatDate(stage.completedAt)}</span> : null}
      </span>
    )
  },
}))

const USED_FIELDS = new Set(['sampling:rd_number', 'sampling:client_feedback', 'artwork:designer_status', 'qc_qa:qc_result', 'planning:material_status', 'billing:invoice_number', 'dispatch:dispatch_date'])

const STAGE_FIELD_COLUMNS: SheetColumn[] = STAGES.flatMap((def) =>
  def.fields
    .filter((entry) => !USED_FIELDS.has(`${def.key}:${entry.key}`))
    .map((entry) => ({
      key: `field:${def.key}:${entry.key}`,
      money: isMoneyStageField(def.key, entry.key),
      label: entry.label,
      section: `${def.label} details`,
      scope: 'order' as const,
      align: entry.type === 'number' ? ('right' as const) : undefined,
      wide: entry.type === 'textarea',
      edit: stageEdit(def.key, entry.key),
      render: ({ order }: CellInput) => {
        const value = field(order, def.key, entry.key)
        if (value === null || value === '') return dash(null)
        if (entry.type === 'date') return formatDate(String(value))
        if (entry.type === 'number') return formatQty(Number(value), 2)
        return <span className={cn(entry.type === 'textarea' && 'block max-w-60 truncate')}>{String(value)}</span>
      },
    })),
)

const SPEC_COLUMNS: SheetColumn[] = LINE_SPEC_SECTIONS.flatMap((section) =>
  section.fields.map((entry) => ({
    key: `spec:${section.key}:${entry.key}`,
    label: entry.label,
    section: section.title.charAt(0).toUpperCase() + section.title.slice(1),
    scope: 'line' as const,
    edit: specEdit(section.key, entry.key, entry.options, entry.listKey),
    render: ({ line }: CellInput) => <span className="block max-w-60 truncate">{dash(line?.specs?.[section.key]?.[entry.key])}</span>,
  })),
)

export const ALL_COLUMNS: SheetColumn[] = [...BASE_COLUMNS, ...STAGE_STATUS_COLUMNS, ...STAGE_FIELD_COLUMNS, ...SPEC_COLUMNS]

export const SHEET_VIEWS: Array<{ key: string; label: string; hint: string; columns: string[] }> = [
  {
    key: 'master',
    label: 'Master sheet',
    hint: 'The order book the office keeps today',
    columns: [
      'orderDate', 'orderType', 'packSize', 'quantity', 'batchNo', 'month', 'mrp', 'mrpPerUnit', 'expiry', 'customer', 'verified', 'salesPoc',
      'rdNo', 'artwork', 'qa', 'printing', 'pmStock', 'materialStatus', 'primaryPkg', 'rate', 'billingRemarks', 'designerStatus', 'track',
    ],
  },
  {
    key: 'stages',
    label: 'Stage by stage',
    hint: 'Where every order is, one column per stage',
    columns: ['customer', 'packSize', 'quantity', 'delivery', ...STAGE_STATUS_COLUMNS.map((column) => column.key)],
  },
  {
    key: 'sales',
    label: 'Sales & accounts',
    hint: 'Value, payments, invoice and dispatch',
    columns: ['orderDate', 'customer', 'customerPo', 'salesPoc', 'quantity', 'rate', 'lineTotal', 'orderTotal', 'received', 'due', 'paymentTerms', 'verified', 'invoiceNo', 'dispatchDate', 'delivery'],
  },
  {
    key: 'production',
    label: 'Production',
    hint: 'Material, manufacturing, filling, packing and QC',
    columns: [
      'customer', 'packSize', 'quantity', 'batchNo', 'materialStatus', 'status:planning', 'status:manufacturing', 'field:manufacturing:batch_no', 'field:manufacturing:batch_size',
      'status:filling', 'field:filling:filled_units', 'status:packing', 'field:packing:packed_qty', 'field:packing:location', 'qa', 'delivery',
    ],
  },
  {
    key: 'rnd',
    label: 'R&D & artwork',
    hint: 'Samples, specs, artwork and packing material',
    columns: [
      'customer', 'packSize', 'rdNo', 'field:sampling:sample_name', 'sampleFeedback', 'spec:production:colour', 'spec:production:fragrance', 'spec:production:texture',
      'status:artwork', 'designerStatus', 'pmStock', 'spec:primary:name', 'spec:primary:cap_colour', 'spec:secondary:carton_vendor',
    ],
  },
]

export const DEFAULT_VIEW = SHEET_VIEWS[0]

export const BRAND_COLUMN: SheetColumn = {
  key: 'brand',
  label: 'Brand / product name',
  section: 'Core identifiers',
  scope: 'line',
  edit: lineEdit('brandName'),
  render: ({ line }) => <span className="block max-w-72 truncate font-semibold text-foreground">{line?.brandName || line?.productTitle || '—'}</span>,
}
