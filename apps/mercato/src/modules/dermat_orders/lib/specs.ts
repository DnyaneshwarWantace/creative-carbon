export type SpecField = { key: string; label: string; options?: string[] }
export type SpecSection = { key: 'production' | 'primary' | 'secondary'; title: string; fields: SpecField[] }

export const LINE_SPEC_SECTIONS: SpecSection[] = [
  {
    key: 'production',
    title: 'Production specifications',
    fields: [
      { key: 'colour', label: 'Colour' },
      { key: 'fragrance', label: 'Fragrance' },
      { key: 'texture', label: 'Texture' },
      { key: 'sample_name', label: 'Sample name' },
      { key: 'rnd_batch_no', label: 'R&D sample batch no.' },
      { key: 'expiry_month', label: 'Expiry month' },
      { key: 'mfg_month', label: 'Mfg. month' },
      { key: 'production_remarks', label: 'Production remarks' },
    ],
  },
  {
    key: 'primary',
    title: 'Tube / Bottle packaging specifications',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'packing_code', label: 'Packing code' },
      { key: 'cap_colour', label: 'Cap colour' },
      { key: 'body_colour', label: 'Body colour' },
      { key: 'tube_shape', label: 'Round or oval tube', options: ['Round', 'Oval'] },
      { key: 'decoration', label: 'Labelled or printed tube', options: ['Labelled', 'Printed'] },
      { key: 'finish', label: 'Matt or glossy finishing', options: ['Matt', 'Glossy'] },
      { key: 'vendor', label: 'Tube / bottle vendor' },
      { key: 'leafing', label: 'Leafing, UV, foiling etc.' },
      { key: 'remarks', label: 'Packaging remarks' },
    ],
  },
  {
    key: 'secondary',
    title: 'Secondary packaging specifications',
    fields: [
      { key: 'lamination', label: 'Drip-off spot UV / Thermal matt lamination / Metallic spot UV' },
      { key: 'shrink_pack', label: 'Shrink pack (tube / bottle or carton)' },
      { key: 'hologram_leaflet', label: 'Hologram / Leaflet etc.' },
      { key: 'carton_vendor', label: 'Carton vendor' },
      { key: 'remarks', label: 'Packaging remarks' },
    ],
  },
]

export const PARTY_SIDE = 'Party side'

export type LineSpecs = Partial<Record<SpecSection['key'], Record<string, string>>>
