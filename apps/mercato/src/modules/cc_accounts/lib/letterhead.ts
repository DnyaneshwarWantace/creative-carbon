import type { Letterhead } from '../data/entities'

export type { Letterhead }

export const LETTERHEAD_TEXT_KEYS = [
  'letterheadAddress',
  'worksAddress',
  'mobile',
  'email2',
  'cin',
  'udyam',
  'stateName',
  'stateCode',
  'exciseNo',
  'certifications',
  'bankLabel',
  'sisterConcern',
  'declaration',
  'jurisdiction',
  'directors',
  'labPeople',
  'logoUrl',
  'badgesUrl',
  'signatureUrl',
  'stampUrl',
] as const

export type LetterheadTextKey = (typeof LETTERHEAD_TEXT_KEYS)[number]

export type LetterheadView = { [Key in LetterheadTextKey]: string } & { showBadges: boolean }

export const DEFAULT_LOGO_URL = '/ccpl-logo.png'
export const DEFAULT_BADGES_URL = '/ccpl-iso-badges.png'

export const DEFAULT_LETTERHEAD: LetterheadView = {
  letterheadAddress: '207-208, GAGANDEEP TOWER, PALDI CHAR RASTA, PALDI, AHMEDABAD - 380 006. (GUJARAT) INDIA.',
  worksAddress: 'MALARPUR ROAD, KHEDA, Gujarat, 387540',
  mobile: '+91 - 90990 76658',
  email2: 'cccpl@creativecarbon.in',
  cin: 'U25209GJ2020PTC111813',
  udyam: 'GJ-01-0035034 (Micro)',
  stateName: 'Gujarat',
  stateCode: '24',
  exciseNo: '',
  certifications: 'ISO 9001-2015 Certified\nISO 14001-2015 Certified',
  bankLabel: '',
  sisterConcern: '',
  declaration:
    '(1) We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.\n2) Notify us if any discrepancy is observed within 07 days of receipt of invoice otherwise it will be assumed that the invoice has been accepted in all respects.\n3) Please make payment of the bill amount within the credit period of invoice date otherwise interest @ 24% will be charged from the due date.\n4) Subject to Ahmedabad Jurisdiction',
  jurisdiction: 'Ahmedabad',
  directors: '',
  labPeople: '',
  logoUrl: DEFAULT_LOGO_URL,
  badgesUrl: DEFAULT_BADGES_URL,
  signatureUrl: '',
  stampUrl: '',
  showBadges: true,
}

export function letterheadOf(stored: Letterhead | null | undefined): LetterheadView {
  const saved = stored ?? {}
  const merged = { ...DEFAULT_LETTERHEAD }
  for (const key of LETTERHEAD_TEXT_KEYS) {
    const value = saved[key]
    if (typeof value === 'string') merged[key] = value
  }
  if (typeof saved.showBadges === 'boolean') merged.showBadges = saved.showBadges
  if (!merged.logoUrl) merged.logoUrl = DEFAULT_LOGO_URL
  if (!merged.badgesUrl) merged.badgesUrl = DEFAULT_BADGES_URL
  return merged
}

export function peopleList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
