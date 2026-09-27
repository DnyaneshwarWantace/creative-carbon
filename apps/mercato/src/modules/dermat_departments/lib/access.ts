export type Ability = { feature: string; label: string; short: string }
export type AccessArea = { key: string; label: string; department: string; pages: string; abilities: Ability[]; independent?: boolean; requires?: string[] }

export const ACCESS_AREAS: AccessArea[] = [
  {
    key: 'overview',
    label: 'Overview',
    department: 'Everyone',
    pages: 'Overview, My pending work, Turnaround',
    independent: true,
    abilities: [
      { feature: 'dermat_dashboard.my_work', label: 'See their own pending work', short: 'Own work' },
      { feature: 'dermat_dashboard.view', label: 'See the overview dashboard and turnaround', short: 'Dashboard' },
      { feature: 'dermat_dashboard.everyone', label: "See everyone's pending work", short: 'Everyone' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    department: 'Sales',
    pages: 'Customer list, customer file and statement',
    abilities: [
      { feature: 'customers.companies.view', label: 'See customers', short: 'View' },
      { feature: 'customers.companies.manage', label: 'Add and edit customers', short: 'Edit' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    department: 'Sales',
    pages: 'Order Book, order page, batch register',
    abilities: [
      { feature: 'dermat_orders.view', label: 'See orders and where they are', short: 'View' },
      { feature: 'dermat_orders.manage', label: 'Book, edit and cancel orders', short: 'Book' },
      { feature: 'dermat_orders.money', label: 'See prices, order value and payments', short: 'Prices' },
      { feature: 'dermat_orders.reopen', label: 'Reopen finished stages after the time limit', short: 'Late reopen' },
    ],
  },
  {
    key: 'work',
    label: 'Department stages',
    department: 'Every department',
    pages: 'Department work pages in the sidebar, and the stage forms on each order',
    independent: true,
    requires: ['dermat_orders.view', 'dermat_orders.stages'],
    abilities: [
      { feature: 'dermat_orders.work.accounts', label: 'Advance and billing', short: 'Accounts' },
      { feature: 'dermat_orders.work.rnd', label: 'Sampling and formula', short: 'R&D' },
      { feature: 'dermat_orders.work.artwork', label: 'Artwork & packaging', short: 'Artwork' },
      { feature: 'dermat_orders.work.planning', label: 'Material planning', short: 'Planning' },
      { feature: 'dermat_orders.work.production', label: 'Manufacturing, filling and packing', short: 'Production' },
      { feature: 'dermat_orders.work.qa', label: 'QA release', short: 'QA' },
      { feature: 'attachments.manage', label: 'Upload stage documents and photos', short: 'Uploads' },
      { feature: 'dermat_orders.work.dispatch', label: 'Dispatch', short: 'Dispatch' },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    department: 'Accounts',
    pages: 'Proformas, invoices, payments, dues',
    abilities: [
      { feature: 'dermat_accounts.view', label: 'See invoices, payments and dues', short: 'View' },
      { feature: 'dermat_accounts.record', label: 'Make invoices, record and correct payments', short: 'Record' },
    ],
  },
  {
    key: 'boms',
    label: 'Formula & BOM',
    department: 'R&D',
    pages: 'BOM list, BOM page, order formula',
    abilities: [
      { feature: 'dermat_boms.view', label: 'See formulas and BOMs', short: 'View' },
      { feature: 'dermat_boms.manage', label: 'Write and change BOMs', short: 'Edit' },
      { feature: 'dermat_boms.approve', label: 'Approve BOMs', short: 'Approve' },
    ],
  },
  {
    key: 'rnd',
    label: 'R&D requests',
    department: 'R&D',
    pages: 'R&D requests, samples sent to clients',
    abilities: [
      { feature: 'dermat_rnd.view', label: 'See R&D requests and samples', short: 'View' },
      { feature: 'dermat_rnd.request', label: 'Raise requests and record client feedback', short: 'Request' },
      { feature: 'dermat_rnd.manage', label: 'Work requests: make and send samples', short: 'Work' },
    ],
  },
  {
    key: 'planning',
    label: 'Planning',
    department: 'Planning',
    pages: 'Planning board, reserved stock',
    abilities: [
      { feature: 'dermat_planning.view', label: 'See the planning board and reservations', short: 'View' },
      { feature: 'dermat_planning.reserve', label: 'Reserve, move and clear stock', short: 'Reserve' },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    department: 'Purchase',
    pages: 'Purchase orders, goods receiving',
    abilities: [
      { feature: 'dermat_purchase.view', label: 'See purchase orders and GRNs', short: 'View' },
      { feature: 'dermat_purchase.manage', label: 'Raise and edit purchase orders', short: 'Raise' },
      { feature: 'dermat_purchase.approve', label: 'Approve purchase orders', short: 'Approve' },
      { feature: 'dermat_purchase.receive', label: 'Receive goods and return to vendor', short: 'Receive' },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    department: 'Purchase',
    pages: 'Vendor list and vendor file',
    abilities: [
      { feature: 'dermat_vendors.view', label: 'See vendors', short: 'View' },
      { feature: 'dermat_vendors.manage', label: 'Add and edit vendors', short: 'Edit' },
    ],
  },
  {
    key: 'store',
    label: 'Store',
    department: 'Store',
    pages: 'Store requests, stock, stock ledger',
    abilities: [
      { feature: 'dermat_store.view', label: 'See store requests', short: 'View' },
      { feature: 'dermat_store.request', label: 'Ask for material, confirm receipt, return leftover', short: 'Request' },
      { feature: 'dermat_store.issue', label: 'Issue material from the store', short: 'Issue' },
      { feature: 'dermat_store.adjust', label: 'Add or remove stock by hand, move stock between stores', short: 'Adjust' },
    ],
  },
  {
    key: 'quality',
    label: 'QC & QA',
    department: 'Quality',
    pages: 'QC checks, QC rules, QA release, QA documents',
    abilities: [
      { feature: 'dermat_quality.view', label: 'See QC checks and rules', short: 'View' },
      { feature: 'dermat_quality.chemical', label: 'Record and approve chemical tests', short: 'Chemical' },
      { feature: 'dermat_quality.micro', label: 'Record and approve micro tests', short: 'Micro' },
      { feature: 'dermat_quality.rules', label: 'Change QC rules and parameters', short: 'Rules' },
      { feature: 'dermat_quality.documents', label: 'Issue and revise QA documents (SOPs, formats)', short: 'Documents' },
    ],
  },
  {
    key: 'masters',
    label: 'Masters',
    department: 'Admin',
    pages: 'Departments, dropdown lists',
    independent: true,
    abilities: [
      { feature: 'dermat_departments.view', label: 'See departments', short: 'Departments' },
      { feature: 'dermat_departments.manage', label: 'Add and edit departments', short: 'Edit depts' },
      { feature: 'dermat_lists.manage', label: 'Change dropdown lists', short: 'Dropdowns' },
      { feature: 'dermat_accounts.series', label: 'Change document number series', short: 'Numbering' },
      { feature: 'dermat_orders.settings', label: 'Change workflow stages', short: 'Stages' },
    ],
  },
]

export const ROLE_LABELS: Record<string, { label: string; department: string }> = {
  superadmin: { label: 'Super admin', department: 'System' },
  admin: { label: 'Admin / owner', department: 'Management' },
  employee: { label: 'Employee (basic)', department: 'General' },
  sales: { label: 'Sales', department: 'Sales' },
  accounts: { label: 'Accounts', department: 'Accounts' },
  research: { label: 'R&D', department: 'R&D' },
  procurement: { label: 'Purchase', department: 'Purchase' },
  pm_store: { label: 'Store', department: 'Store' },
  operator: { label: 'Production operator', department: 'Production' },
  production_staff: { label: 'Production staff', department: 'Production' },
  supervisor: { label: 'Production supervisor', department: 'Production' },
  quality_control: { label: 'QC', department: 'Quality' },
  quality_assurance: { label: 'QA', department: 'Quality' },
}

export function roleLabel(name: string): string {
  return ROLE_LABELS[name]?.label ?? name.replace(/[_-]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

export function hasFeature(features: string[], isSuperAdmin: boolean, feature: string): boolean {
  if (isSuperAdmin) return true
  if (features.includes('*') || features.includes(feature)) return true
  const parts = feature.split('.')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    if (features.includes(`${parts.slice(0, index).join('.')}.*`)) return true
  }
  return false
}

function areaOf(feature: string): AccessArea | undefined {
  return ACCESS_AREAS.find((area) => area.abilities.some((ability) => ability.feature === feature))
}

function expandWildcard(features: string[], feature: string): string[] {
  const prefix = feature.split('.')[0]
  if (!features.includes(`${prefix}.*`)) return features
  const known = ACCESS_AREAS.flatMap((area) => area.abilities.map((ability) => ability.feature)).filter((entry) => entry.startsWith(`${prefix}.`))
  return [...features.filter((entry) => entry !== `${prefix}.*`), ...known.filter((entry) => !features.includes(entry))]
}

export function setAbility(features: string[], feature: string, enabled: boolean): string[] {
  const area = areaOf(feature)
  const base = area?.abilities[0]?.feature
  if (enabled) {
    const next = new Set(features)
    next.add(feature)
    for (const required of area?.requires ?? []) next.add(required)
    if (base && base !== feature && !area?.independent) next.add(base)
    return [...next]
  }
  let next = expandWildcard(features, feature)
  const removing = new Set([feature])
  if (base === feature && area && !area.independent) for (const ability of area.abilities) removing.add(ability.feature)
  for (const ability of removing) next = expandWildcard(next, ability)
  return next.filter((entry) => !removing.has(entry))
}

export function areaSummary(features: string[], isSuperAdmin: boolean, area: AccessArea): { granted: Ability[]; level: 'none' | 'some' | 'all' } {
  const granted = area.abilities.filter((ability) => hasFeature(features, isSuperAdmin, ability.feature))
  return { granted, level: granted.length === 0 ? 'none' : granted.length === area.abilities.length ? 'all' : 'some' }
}
