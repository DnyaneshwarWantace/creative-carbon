import type { QcOperation, QcParameter } from '../data/entities'

export const QC_OPERATIONS: Array<{ key: QcOperation; label: string; hint: string }> = [
  { key: 'purchase_receipt', label: 'Purchase receipt (inward)', hint: 'Raw and packing material arriving at the store' },
  { key: 'bulk', label: 'Bulk after manufacturing', hint: 'The bulk made in the vessel, before filling' },
  { key: 'filling', label: 'After filling', hint: 'Filled bottles / tubes. The client skips this by default' },
  { key: 'packing', label: 'Final after packing', hint: 'Packed finished goods, before QA release' },
]

export const QC_CLASSES = ['Critical', 'Major', 'Minor']

const chem = (key: string, name: string, spec = '', cls = 'Critical'): QcParameter => ({ key, name, class: cls, spec, test: 'chemical' })
const micro = (key: string, name: string, spec = ''): QcParameter => ({ key, name, class: 'Critical', spec, test: 'micro' })

const MICRO_PARAMETERS = [micro('tamc', 'Total aerobic microbial count'), micro('tymc', 'Total yeast and mould count'), micro('pathogens', 'Specified pathogens')]

export const DEFAULT_RULES: Array<{ operation: QcOperation; title: string; requiresChemical: boolean; requiresMicro: boolean; isActive: boolean; parameters: QcParameter[] }> = [
  {
    operation: 'purchase_receipt',
    title: 'Inward material (default)',
    requiresChemical: true,
    requiresMicro: false,
    isActive: true,
    parameters: [chem('description', 'Description'), chem('identification', 'Identification'), chem('appearance', 'Appearance'), chem('viscosity', 'Viscosity'), chem('nvc', 'Non-volatile content'), ...MICRO_PARAMETERS],
  },
  {
    operation: 'bulk',
    title: 'Bulk QC (default)',
    requiresChemical: true,
    requiresMicro: true,
    isActive: true,
    parameters: [chem('appearance', 'Appearance'), chem('colour', 'Colour'), chem('odour', 'Odour'), chem('ph', 'pH'), chem('viscosity', 'Viscosity'), ...MICRO_PARAMETERS],
  },
  {
    operation: 'filling',
    title: 'Filling QC (default, off)',
    requiresChemical: true,
    requiresMicro: false,
    isActive: false,
    parameters: [chem('average_weight', 'Average weight'), chem('uniformity', 'Uniformity of weight'), chem('fill_volume', 'Fill volume'), chem('leak', 'Leak / cap check')],
  },
  {
    operation: 'packing',
    title: 'Final QC after packing (default)',
    requiresChemical: true,
    requiresMicro: false,
    isActive: true,
    parameters: [
      chem('appearance', 'Appearance'),
      chem('average_weight', 'Average weight'),
      chem('uniformity', 'Uniformity of weight'),
      chem('coding', 'Batch coding, MRP, Mfg and Exp print'),
      chem('artwork', 'Carton and label match approved artwork'),
      ...MICRO_PARAMETERS,
    ],
  },
]

export const STAGE_TO_OPERATION: Record<string, QcOperation> = {
  manufacturing: 'bulk',
  filling: 'filling',
  packing: 'packing',
}
