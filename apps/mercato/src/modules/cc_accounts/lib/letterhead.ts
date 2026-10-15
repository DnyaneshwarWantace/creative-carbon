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

export const DEFAULT_LETTERHEAD: LetterheadView = {
  letterheadAddress: '',
  worksAddress: '',
  mobile: '',
  email2: '',
  cin: '',
  udyam: '',
  stateName: '',
  stateCode: '',
  exciseNo: '',
  certifications: '',
  bankLabel: '',
  sisterConcern: '',
  declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  jurisdiction: '',
  directors: '',
  labPeople: '',
  logoUrl: '',
  badgesUrl: '',
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
  return merged
}

export function peopleList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
