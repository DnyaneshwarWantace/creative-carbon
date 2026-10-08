import type { VENDOR_CATEGORIES } from '../data/validators'

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]

export const VENDOR_CATEGORY_LABEL: Record<VendorCategory, string> = {
  rm_supplier: 'Chemicals and reinforcement',
  pm_supplier: 'Consumables and packing',
  both: 'Materials and consumables',
}
