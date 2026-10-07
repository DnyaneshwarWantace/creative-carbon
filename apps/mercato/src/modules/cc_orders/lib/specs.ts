export type SpecField = { key: string; label: string; options?: string[]; listKey?: string }
export type SpecSectionKey = 'material' | 'packing'
export type SpecSection = { key: SpecSectionKey; title: string; fields: SpecField[] }

export const LINE_SPEC_SECTIONS: SpecSection[] = [
  {
    key: 'material',
    title: 'Material',
    fields: [
      { key: 'form', label: 'Form', options: ['Sheet', 'Tube', 'Rod', 'Moulded part', 'B-stage', 'Raw material', 'Bought-in'], listKey: 'product_forms' },
      { key: 'grade', label: 'Grade', listKey: 'laminate_grades' },
      { key: 'weave', label: 'Weave / paper', listKey: 'weaves' },
      { key: 'sheet_size', label: 'Sheet size', listKey: 'sheet_sizes' },
      { key: 'thickness_mm', label: 'Thickness (mm)' },
      { key: 'pieces', label: 'Pieces' },
      { key: 'die_no', label: 'Die No.' },
    ],
  },
  {
    key: 'packing',
    title: 'Packing & testing',
    fields: [
      { key: 'pack_type', label: 'Packing', options: ['Pallet (export)', 'PP wrap + LDP stitch (local)'], listKey: 'pack_types' },
      { key: 'marking', label: 'Marking' },
      { key: 'test_standard', label: 'Test standard', options: ['IS 2036', 'NEMA', 'IEC', 'BIS', 'Customer spec'], listKey: 'test_standards' },
      { key: 'remarks', label: 'Remarks' },
    ],
  },
]

export const PARTY_SIDE = 'Customer side'

export type LineSpecs = Partial<Record<SpecSectionKey, Record<string, string>>>
