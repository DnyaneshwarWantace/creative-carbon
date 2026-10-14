export type DieFamilyKey = 'fibre_bearing' | 'fibre_key' | 'hanger' | 'inside_bearing' | 'sheet_plate' | 'rod_drawing' | 'tube'

export const DIE_FAMILIES: Record<DieFamilyKey, { label: string; short: string; dimensions: string[] }> = {
  fibre_bearing: { label: 'Fibre bearing', short: 'FB', dimensions: ['R1', 'R2', 'R3', 'R4', 'T', 'K', 'L1', 'L2', 'H1', 'H2', 'H3'] },
  fibre_key: { label: 'Fibre key', short: 'FK', dimensions: ['L1', 'L2', 'W', 'H1', 'H2', 'R1', 'R2', 'T'] },
  hanger: { label: 'Hanger', short: 'HG', dimensions: ['R', 'T', 'W', 'L1', 'L2', 'H', 'D'] },
  inside_bearing: { label: 'Inside fibre bearing', short: 'IFB', dimensions: ['R1', 'R2', 'T', 'D', 'H1', 'H2', 'L1'] },
  sheet_plate: { label: 'Mould plate for sheets', short: 'PL', dimensions: ['count'] },
  rod_drawing: { label: 'Rod drawing', short: 'ROD', dimensions: ['OD', 'ID', 'L'] },
  tube: { label: 'Tube / rod cavity mould', short: 'TUBE', dimensions: ['OD', 'L'] },
}

export const DIE_FAMILY_KEYS = Object.keys(DIE_FAMILIES) as DieFamilyKey[]
