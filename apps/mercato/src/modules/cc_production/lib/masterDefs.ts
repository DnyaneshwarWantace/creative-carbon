export type MasterColumnKind = 'text' | 'int' | 'number' | 'bool' | 'select' | 'customer'

export type MasterColumn = {
  key: string
  label: string
  kind: MasterColumnKind
  required?: boolean
  options?: Array<{ value: string; label: string }>
  decimals?: number
  placeholder?: string
  importHeaders?: string[]
}

export type MasterType = 'reactors' | 'dryers' | 'presses' | 'moulds' | 'tolerances' | 'prices'

export type MasterDef = {
  type: MasterType
  label: string
  singular: string
  hint: string
  columns: MasterColumn[]
  uniqueKeys: string[]
  orderBy: Array<{ key: string; dir: 'asc' | 'desc' }>
  viewFeature: string
  manageFeature: string
  importable?: boolean
}

const MASTERS_VIEW = 'cc_production.masters.view'
const MASTERS_MANAGE = 'cc_production.masters.manage'

export const MASTER_DEFS: Record<MasterType, MasterDef> = {
  reactors: {
    type: 'reactors',
    label: 'Reactors',
    singular: 'Reactor',
    hint: 'Resin vessels. The resin batch report names the vessel, e.g. CCCPL-VES-2.',
    columns: [
      { key: 'code', label: 'Vessel', kind: 'text', required: true, placeholder: 'CCCPL-VES-1' },
      { key: 'capacityKg', label: 'Capacity (kg)', kind: 'number', decimals: 3 },
      { key: 'notes', label: 'Notes', kind: 'text' },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['code'],
    orderBy: [{ key: 'code', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
  },
  dryers: {
    type: 'dryers',
    label: 'Dryers',
    singular: 'Dryer',
    hint: 'Impregnation lines (Dryer No. 1, 2, 3) and the mixer oven.',
    columns: [
      { key: 'code', label: 'Dryer', kind: 'text', required: true, placeholder: 'Dryer 1' },
      { key: 'kind', label: 'Type', kind: 'select', required: true, options: [{ value: 'dryer', label: 'Impregnation line' }, { value: 'mixer', label: 'Mixer oven' }] },
      { key: 'notes', label: 'Notes', kind: 'text' },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['code'],
    orderBy: [{ key: 'code', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
  },
  presses: {
    type: 'presses',
    label: 'Presses',
    singular: 'Press',
    hint: '25 presses; 1–20 small, 21–24 big. Daylights limit how many daylights a press batch can have.',
    columns: [
      { key: 'number', label: 'Press No.', kind: 'int', required: true },
      { key: 'pressType', label: 'Size', kind: 'select', required: true, options: [{ value: 'small', label: 'Small' }, { value: 'big', label: 'Big' }] },
      { key: 'daylights', label: 'Daylights', kind: 'int' },
      { key: 'usage', label: 'Used for', kind: 'select', required: true, options: [{ value: 'laminate', label: 'Laminate sheets' }, { value: 'moulding', label: 'Moulding' }, { value: 'both', label: 'Both' }] },
      { key: 'isWorking', label: 'Working', kind: 'bool' },
      { key: 'notes', label: 'Notes', kind: 'text' },
    ],
    uniqueKeys: ['number'],
    orderBy: [{ key: 'number', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
  },
  moulds: {
    type: 'moulds',
    label: 'Moulds & dies',
    singular: 'Mould / die',
    hint: 'About 3,000 dies and plates, kept by their own numbers. Dies belong to a customer; plates usually do not.',
    columns: [
      { key: 'dieNo', label: 'Die No.', kind: 'text', required: true, placeholder: '1155', importHeaders: ['die no', 'die no.', 'die', 'mould no', 'mold no', 'number', 'no'] },
      { key: 'mouldType', label: 'Die / plate', kind: 'select', required: true, options: [{ value: 'die', label: 'Die' }, { value: 'plate', label: 'Plate' }], importHeaders: ['type', 'die / plate', 'die/plate'] },
      { key: 'description', label: 'Description', kind: 'text', importHeaders: ['description', 'item', 'part'] },
      { key: 'size', label: 'Size', kind: 'text', importHeaders: ['size', 'plate size', 'die size'] },
      { key: 'finish', label: 'Finish', kind: 'select', options: [{ value: 'mirror', label: 'Mirror' }, { value: 'satin', label: 'Satin' }], importHeaders: ['finish'] },
      { key: 'thicknessMm', label: 'Thickness (mm)', kind: 'number', decimals: 2, importHeaders: ['thickness', 'thickness mm', 'thickness (mm)'] },
      { key: 'customerId', label: 'Customer', kind: 'customer', importHeaders: ['customer', 'party'] },
      { key: 'customerMouldNo', label: "Customer's mould No.", kind: 'text', importHeaders: ['customer mould no', 'customer die no', 'customer no'] },
      { key: 'storeLocation', label: 'Kept at', kind: 'text', importHeaders: ['location', 'kept at', 'rack'] },
      { key: 'heatUpMinutes', label: 'Heat-up (min)', kind: 'int', importHeaders: ['heat time', 'die heat time', 'heat up'] },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['dieNo'],
    orderBy: [{ key: 'dieNo', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
    importable: true,
  },
  tolerances: {
    type: 'tolerances',
    label: 'Loading tolerance',
    singular: 'Tolerance',
    hint: 'Allowed loading weight per sheet by thickness. A press batch outside this range shows a warning; it never blocks.',
    columns: [
      { key: 'thicknessMm', label: 'Thickness (mm)', kind: 'number', decimals: 2, required: true },
      { key: 'minKg', label: 'Min kg', kind: 'number', decimals: 3, required: true },
      { key: 'maxKg', label: 'Max kg', kind: 'number', decimals: 3, required: true },
      { key: 'notes', label: 'Notes', kind: 'text' },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['thicknessMm'],
    orderBy: [{ key: 'thicknessMm', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
  },
  prices: {
    type: 'prices',
    label: 'Price lists',
    singular: 'Rate',
    hint: 'Selling rates per kg for small and big sizes. Only the owner and sales see these.',
    columns: [
      { key: 'sizeClass', label: 'Size', kind: 'select', required: true, options: [{ value: 'small', label: 'Small size' }, { value: 'big', label: 'Big size' }] },
      { key: 'grade', label: 'Grade', kind: 'text', required: true, placeholder: 'F2F3' },
      { key: 'thicknessFrom', label: 'From (mm)', kind: 'number', decimals: 2 },
      { key: 'thicknessTo', label: 'To (mm)', kind: 'number', decimals: 2 },
      { key: 'ratePerKg', label: 'Rate per kg', kind: 'number', decimals: 2, required: true },
      { key: 'currency', label: 'Currency', kind: 'select', required: true, options: [{ value: 'INR', label: 'INR' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' }] },
      { key: 'notes', label: 'Notes', kind: 'text' },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['sizeClass', 'grade', 'thicknessFrom', 'thicknessTo', 'currency'],
    orderBy: [{ key: 'grade', dir: 'asc' }, { key: 'sizeClass', dir: 'asc' }, { key: 'thicknessFrom', dir: 'asc' }],
    viewFeature: 'cc_production.prices.view',
    manageFeature: 'cc_production.prices.manage',
  },
}

export const MASTER_TYPES = Object.keys(MASTER_DEFS) as MasterType[]

export function masterDef(type: string): MasterDef | null {
  return (MASTER_DEFS as Record<string, MasterDef>)[type] ?? null
}
