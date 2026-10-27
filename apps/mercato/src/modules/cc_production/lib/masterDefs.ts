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

export type MasterType = 'reactors' | 'dryers' | 'presses' | 'moulds' | 'chart' | 'tolerances' | 'prices'

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

export const CHART_DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: 'r1', label: 'R1' },
  { key: 'r2', label: 'R2' },
  { key: 'r3', label: 'R3' },
  { key: 'r4', label: 'R4' },
  { key: 't', label: 'T' },
  { key: 'k', label: 'K' },
  { key: 'l1', label: 'L1' },
  { key: 'l2', label: 'L2' },
  { key: 'w', label: 'W' },
  { key: 'h1', label: 'H1' },
  { key: 'h2', label: 'H2' },
  { key: 'h3', label: 'H3' },
  { key: 'd', label: 'D' },
  { key: 'od', label: 'OD' },
  { key: 'idDia', label: 'ID' },
  { key: 'lengthMm', label: 'Length' },
]

export const CHART_FAMILIES: Array<{ value: string; label: string; dimensions: string[] }> = [
  { value: 'fibre_bearing', label: 'Fibre bearing', dimensions: ['r1', 'r2', 'r3', 'r4', 't', 'k', 'l1', 'l2', 'h1', 'h2', 'h3'] },
  { value: 'fibre_key', label: 'Fibre key', dimensions: ['l1', 'l2', 'w', 'h1', 'h2', 'r1', 'r2', 't'] },
  { value: 'hanger', label: 'Hanger', dimensions: ['r1', 't', 'w', 'l1', 'l2', 'h1', 'd'] },
  { value: 'inside_bearing', label: 'Inside fibre bearing', dimensions: ['r1', 'r2', 't', 'd', 'h1', 'h2', 'l1'] },
  { value: 'rod', label: 'Rod', dimensions: ['od', 'idDia', 'lengthMm'] },
  { value: 'tube', label: 'Tube', dimensions: ['od', 'lengthMm'] },
  { value: 'plate', label: 'Mould plate', dimensions: [] },
]

const CHART_VIEW = 'cc_production.masters.view'

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
      { key: 'cavities', label: 'Cavities (pieces per shot)', kind: 'int', importHeaders: ['cavity', 'cavities', 'no of cavity', 'pieces per shot'] },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['dieNo'],
    orderBy: [{ key: 'dieNo', dir: 'asc' }],
    viewFeature: MASTERS_VIEW,
    manageFeature: MASTERS_MANAGE,
    importable: true,
  },
  chart: {
    type: 'chart',
    label: 'Die chart',
    singular: 'Chart entry',
    hint: 'The CCPL die chart: fibre bearing, fibre key, hanger, inside fibre bearing, rod and tube moulds (with cavities) and mould plates. Dimensions are in mm; weight is kg per piece.',
    columns: [
      { key: 'family', label: 'Family', kind: 'select', required: true, options: CHART_FAMILIES.map(({ value, label }) => ({ value, label })), importHeaders: ['type', 'sheet', 'family'] },
      { key: 'serialNo', label: 'Chart No.', kind: 'text', importHeaders: ['no', 'no.', 'sr no', 'sr.no.', 'sr no.', 'serial'] },
      { key: 'code', label: 'Code No.', kind: 'text', required: true, placeholder: 'CCPL - 570', importHeaders: ['code', 'code no', 'code no.', 'die no', 'drawing', 'mould plates'] },
      ...CHART_DIMENSIONS.map((dimension) => ({ key: dimension.key, label: dimension.label, kind: 'text' as const, importHeaders: dimension.key === 'idDia' ? ['id dia', 'inner dia'] : dimension.key === 'od' ? ['od dia', 'rod od'] : dimension.key === 'lengthMm' ? ['length', 'length mm'] : undefined })),
      { key: 'weightKg', label: 'Weight (kg)', kind: 'number', decimals: 3, importHeaders: ['wt', 'wt kg', 'wt.kg', 'weight', 'weight kg'] },
      { key: 'cavities', label: 'Cavities', kind: 'int', importHeaders: ['cavity', 'cavities'] },
      { key: 'quantity', label: 'Qty', kind: 'int', importHeaders: ['qty', 'qty.', 'quantity'] },
      { key: 'customerRef', label: 'Customer / ref.', kind: 'text', importHeaders: ['rf', 'rf.', 'ref', 'customer', 'customer ref'] },
      { key: 'cutDrawingNo', label: 'Cut drawing No.', kind: 'text', importHeaders: ['cut dwg no', 'cut.dwg.no'] },
      { key: 'chartPage', label: 'Chart page', kind: 'text', importHeaders: ['page'] },
      { key: 'size', label: 'Size', kind: 'text' },
      { key: 'note', label: 'Note', kind: 'text' },
      { key: 'isActive', label: 'In use', kind: 'bool' },
    ],
    uniqueKeys: ['family', 'serialNo', 'code'],
    orderBy: [{ key: 'family', dir: 'asc' }, { key: 'serialNo', dir: 'asc' }, { key: 'code', dir: 'asc' }],
    viewFeature: CHART_VIEW,
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
