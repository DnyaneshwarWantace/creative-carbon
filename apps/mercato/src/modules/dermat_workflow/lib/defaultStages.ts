import type {
  QcParameterDefinition,
  StageDefinitionConfig,
  StageFieldDefinition,
  StageKind,
  StageSubjectType,
} from '../data/entities'

export type DefaultStageDefinition = {
  code: string
  name: string
  subjectType: StageSubjectType
  phase?: string
  phaseLabel?: string
  unit?: string
  sequence: number
  department: string
  kind: StageKind
  fields: StageFieldDefinition[]
  config?: StageDefinitionConfig
  isOptional?: boolean
  isAutomatic?: boolean
}

export const WORKFLOW_DEPARTMENTS = [
  'sales',
  'accounts',
  'rnd',
  'planning',
  'store',
  'production',
  'qc',
  'qa',
  'dispatch',
] as const

export type WorkflowDepartment = (typeof WORKFLOW_DEPARTMENTS)[number]

export const PRODUCTION_STAGE_CODE = 'production'
export const POST_PRODUCTION_STAGE_CODE = 'qc_qa'

const defaultQcParameters: QcParameterDefinition[] = [
  { parameter: 'Appearance', classification: 'Critical', specification: '' },
  { parameter: 'Colour', classification: 'Critical', specification: '' },
  { parameter: 'Odour', classification: 'Critical', specification: '' },
  { parameter: 'pH', classification: 'Critical', specification: '' },
  { parameter: 'Viscosity', classification: 'Critical', specification: '' },
]

export const DEFAULT_STAGE_DEFINITIONS: DefaultStageDefinition[] = [
  {
    code: 'new',
    name: 'New Order',
    subjectType: 'order',
    sequence: 10,
    department: 'sales',
    kind: 'form',
    fields: [
      { key: 'order_reviewed', label: 'Order details reviewed with client', type: 'checkbox', required: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'advance_payment',
    name: 'Advance Payment',
    subjectType: 'order',
    sequence: 20,
    department: 'accounts',
    kind: 'form',
    fields: [
      { key: 'advance_received_amount', label: 'Advance received amount', type: 'number', required: true, unit: 'INR' },
      { key: 'advance_received_at', label: 'Received on', type: 'date', required: true },
      { key: 'payment_ref', label: 'Payment reference / UTR', type: 'text' },
    ],
    isOptional: true,
  },
  {
    code: 'verified',
    name: 'Order Verification',
    subjectType: 'order',
    sequence: 30,
    department: 'sales',
    kind: 'form',
    fields: [
      { key: 'verify_note', label: 'Verification note', type: 'textarea', required: true },
    ],
  },
  {
    code: 'rnd_sample',
    name: 'R&D / Sample',
    subjectType: 'order',
    sequence: 40,
    department: 'rnd',
    kind: 'form',
    fields: [
      { key: 'sample_sent_at', label: 'Sample sent on', type: 'date', required: true },
      { key: 'sample_sent_note', label: 'Sample details', type: 'textarea', required: true },
      { key: 'client_decision', label: 'Client decision', type: 'select', required: true, options: ['Approved', 'Changes requested'] },
    ],
    isOptional: true,
  },
  {
    code: 'artwork_packaging',
    name: 'Artwork & Packaging',
    subjectType: 'order',
    sequence: 50,
    department: 'planning',
    kind: 'form',
    fields: [
      { key: 'artwork_source', label: 'Artwork provided by', type: 'select', required: true, options: ['Client', 'Dermat'] },
      { key: 'artwork_approved', label: 'Artwork approved by client', type: 'checkbox', required: true },
      { key: 'packaging_finalized', label: 'Packaging material finalized', type: 'checkbox', required: true },
      { key: 'packing_code', label: 'Master packaging code', type: 'text' },
    ],
  },
  {
    code: 'procurement_material',
    name: 'Material Planning',
    subjectType: 'order',
    sequence: 60,
    department: 'planning',
    kind: 'form',
    fields: [
      { key: 'bom_verified', label: 'BOM verified for every product', type: 'checkbox', required: true },
      { key: 'rm_status', label: 'Raw material status', type: 'select', required: true, options: ['Available / reserved', 'Partially available', 'Ordered from vendor'] },
      { key: 'pm_status', label: 'Packing material status', type: 'select', required: true, options: ['Available / reserved', 'Partially available', 'Ordered from vendor'] },
      { key: 'planned_start_date', label: 'Planned production start', type: 'date', required: true },
      { key: 'planning_note', label: 'Planning note', type: 'textarea' },
    ],
  },
  {
    code: PRODUCTION_STAGE_CODE,
    name: 'Production',
    subjectType: 'order',
    sequence: 70,
    department: 'production',
    kind: 'form',
    fields: [],
    isAutomatic: true,
  },
  {
    code: POST_PRODUCTION_STAGE_CODE,
    name: 'QA Approval',
    subjectType: 'order',
    sequence: 80,
    department: 'qa',
    kind: 'form',
    fields: [
      { key: 'qa_decision', label: 'QA decision', type: 'select', required: true, options: ['Released for dispatch', 'On hold'] },
      { key: 'qa_approval_date', label: 'Approval date', type: 'date', required: true },
      { key: 'qa_remarks', label: 'QA remarks', type: 'textarea' },
    ],
  },
  {
    code: 'billing_payment',
    name: 'Billing & Payment',
    subjectType: 'order',
    sequence: 90,
    department: 'accounts',
    kind: 'form',
    fields: [
      { key: 'invoice_number', label: 'Invoice number', type: 'text', required: true },
      { key: 'invoice_date', label: 'Invoice date', type: 'date', required: true },
      { key: 'balance_payment', label: 'Balance payment', type: 'select', required: true, options: ['Received', 'On credit terms'] },
    ],
  },
  {
    code: 'ready_to_dispatch',
    name: 'Ready to Dispatch',
    subjectType: 'order',
    sequence: 100,
    department: 'dispatch',
    kind: 'form',
    fields: [
      { key: 'transport_arranged', label: 'Transport arranged', type: 'checkbox', required: true },
      { key: 'transporter', label: 'Transporter', type: 'text' },
      { key: 'shipper_count', label: 'Number of shippers', type: 'number' },
    ],
  },
  {
    code: 'dispatched_completed',
    name: 'Dispatched',
    subjectType: 'order',
    sequence: 110,
    department: 'dispatch',
    kind: 'form',
    fields: [
      { key: 'dispatch_date', label: 'Dispatch date', type: 'date', required: true },
      { key: 'lr_number', label: 'LR / docket number', type: 'text', required: true },
      { key: 'vehicle_number', label: 'Vehicle number', type: 'text' },
    ],
  },
  {
    code: 'mfg_requirement',
    name: 'Requirement Providing to Store',
    subjectType: 'order_line',
    phase: 'manufacturing',
    phaseLabel: 'Manufacturing',
    unit: 'KG',
    sequence: 110,
    department: 'store',
    kind: 'form',
    config: { issuesMaterial: 'raw_material' },
    fields: [
      { key: 'rm_issued', label: 'Raw material issued to production', type: 'checkbox', required: true },
      { key: 'issue_reference', label: 'Stock transfer / issue slip no.', type: 'text' },
      { key: 'issue_note', label: 'Note', type: 'textarea' },
    ],
  },
  {
    code: 'mfg_process',
    name: 'Manufacturing',
    subjectType: 'order_line',
    phase: 'manufacturing',
    phaseLabel: 'Manufacturing',
    unit: 'KG',
    sequence: 120,
    department: 'production',
    kind: 'production_output',
    fields: [
      { key: 'output_qty', label: 'Bulk manufactured', type: 'number', required: true, unit: 'KG' },
      { key: 'wastage_qty', label: 'Wastage', type: 'number', unit: 'KG' },
      { key: 'machine', label: 'Machine / vessel', type: 'text' },
      { key: 'operator', label: 'Operator', type: 'text', required: true },
      { key: 'shift', label: 'Shift', type: 'select', options: ['Day', 'Night'] },
    ],
  },
  {
    code: 'mfg_qc',
    name: 'QC Testing (Bulk)',
    subjectType: 'order_line',
    phase: 'manufacturing',
    phaseLabel: 'Manufacturing',
    unit: 'KG',
    sequence: 130,
    department: 'qc',
    kind: 'qc_test',
    fields: [],
    config: { qcParameters: defaultQcParameters },
  },
  {
    code: 'fill_requirement',
    name: 'Bottle Requirement Providing',
    subjectType: 'order_line',
    phase: 'filling',
    phaseLabel: 'Filling',
    unit: 'Bottles',
    sequence: 210,
    department: 'store',
    kind: 'form',
    config: { issuesMaterial: 'packaging_material' },
    fields: [
      { key: 'pm_issued', label: 'Bottles / containers issued to filling', type: 'checkbox', required: true },
      { key: 'issue_reference', label: 'Stock transfer / issue slip no.', type: 'text' },
    ],
  },
  {
    code: 'fill_process',
    name: 'Filling',
    subjectType: 'order_line',
    phase: 'filling',
    phaseLabel: 'Filling',
    unit: 'Bottles',
    sequence: 220,
    department: 'production',
    kind: 'production_output',
    fields: [
      { key: 'output_qty', label: 'Units filled', type: 'number', required: true, unit: 'Bottles' },
      { key: 'wastage_qty', label: 'Rejected / wastage', type: 'number', unit: 'Bottles' },
      { key: 'fill_size', label: 'Fill size (gm / ml)', type: 'text' },
      { key: 'operator', label: 'Operator', type: 'text', required: true },
    ],
  },
  {
    code: 'fill_qc',
    name: 'QC Testing (Filled)',
    subjectType: 'order_line',
    phase: 'filling',
    phaseLabel: 'Filling',
    unit: 'Bottles',
    sequence: 230,
    department: 'qc',
    kind: 'qc_test',
    fields: [],
    config: {
      qcParameters: [
        { parameter: 'Fill weight / volume', classification: 'Critical', specification: '' },
        { parameter: 'Leakage', classification: 'Critical', specification: '' },
        { parameter: 'Appearance', classification: 'Major', specification: '' },
      ],
    },
  },
  {
    code: 'pack_sample',
    name: 'Sample Creation of Finished Good',
    subjectType: 'order_line',
    phase: 'packing',
    phaseLabel: 'Packing',
    unit: 'Pieces',
    sequence: 310,
    department: 'production',
    kind: 'form',
    fields: [
      { key: 'sample_qty', label: 'Samples created', type: 'number', required: true, unit: 'Pieces' },
      { key: 'sample_note', label: 'Note', type: 'textarea' },
    ],
  },
  {
    code: 'pack_qc',
    name: 'QC Testing (Finished Good)',
    subjectType: 'order_line',
    phase: 'packing',
    phaseLabel: 'Packing',
    unit: 'Pieces',
    sequence: 320,
    department: 'qc',
    kind: 'qc_test',
    fields: [],
    config: {
      qcParameters: [
        { parameter: 'Label & batch coding', classification: 'Critical', specification: '' },
        { parameter: 'Carton / sealing', classification: 'Major', specification: '' },
        { parameter: 'Overall appearance', classification: 'Major', specification: '' },
      ],
    },
  },
  {
    code: 'pack_final',
    name: 'All Packaging → Finished Goods',
    subjectType: 'order_line',
    phase: 'packing',
    phaseLabel: 'Packing',
    unit: 'Pieces',
    sequence: 330,
    department: 'production',
    kind: 'production_output',
    fields: [
      { key: 'output_qty', label: 'Finished goods packed', type: 'number', required: true, unit: 'Pieces' },
      { key: 'shipper_count', label: 'Shippers', type: 'number' },
      { key: 'wastage_qty', label: 'Rejected', type: 'number', unit: 'Pieces' },
    ],
  },
]
