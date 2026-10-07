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
      { feature: 'cc_dashboard.my_work', label: 'See their own pending work', short: 'Own work' },
      { feature: 'cc_dashboard.view', label: 'See the overview dashboard and turnaround', short: 'Dashboard' },
      { feature: 'cc_dashboard.everyone', label: "See everyone's pending work", short: 'Everyone' },
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
    pages: 'Order Book, order page',
    abilities: [
      { feature: 'cc_orders.view', label: 'See orders and where they are', short: 'View' },
      { feature: 'cc_orders.manage', label: 'Book, edit and cancel orders', short: 'Book' },
      { feature: 'cc_orders.money', label: 'See prices, order value and payments', short: 'Prices' },
      { feature: 'cc_orders.reopen', label: 'Reopen finished stages after the time limit', short: 'Late reopen' },
    ],
  },
  {
    key: 'work',
    label: 'Department stages',
    department: 'Every department',
    pages: 'Department work pages in the sidebar, and the stage forms on each order',
    independent: true,
    requires: ['cc_orders.view', 'cc_orders.stages'],
    abilities: [
      { feature: 'cc_orders.work.accounts', label: 'Advance / LC and invoice', short: 'Accounts' },
      { feature: 'cc_orders.work.store', label: 'Stock allocation', short: 'FG store' },
      { feature: 'cc_orders.work.qc', label: 'QC and test report', short: 'QC' },
      { feature: 'cc_orders.work.dispatch', label: 'Packing, weighment and despatch', short: 'Despatch' },
      { feature: 'attachments.manage', label: 'Upload stage documents and photos', short: 'Uploads' },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    department: 'Accounts',
    pages: 'Proformas, invoices, payments, dues',
    abilities: [
      { feature: 'cc_accounts.view', label: 'See invoices, payments and dues', short: 'View' },
      { feature: 'cc_accounts.record', label: 'Make invoices, record and correct payments', short: 'Record' },
    ],
  },
  {
    key: 'plant',
    label: 'Plant masters',
    department: 'Production',
    pages: 'Reactors, dryers, presses, moulds & dies, loading tolerance',
    abilities: [
      { feature: 'cc_production.masters.view', label: 'See plant masters', short: 'View' },
      { feature: 'cc_production.masters.manage', label: 'Add and change plant masters, import the mould list', short: 'Edit' },
      { feature: 'cc_production.upload.use', label: 'Use the upload centre (Excel templates and uploads)', short: 'Upload' },
    ],
  },
  {
    key: 'prices',
    label: 'Price lists',
    department: 'Sales',
    pages: 'Small and big size rates per kg',
    abilities: [
      { feature: 'cc_production.prices.view', label: 'See price lists', short: 'View' },
      { feature: 'cc_production.prices.manage', label: 'Change price lists', short: 'Edit' },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    department: 'Purchase',
    pages: 'Purchase orders, goods receiving',
    abilities: [
      { feature: 'cc_purchase.view', label: 'See purchase orders and GRNs', short: 'View' },
      { feature: 'cc_purchase.manage', label: 'Raise and edit purchase orders', short: 'Raise' },
      { feature: 'cc_purchase.approve', label: 'Approve purchase orders', short: 'Approve' },
      { feature: 'cc_purchase.receive', label: 'Receive goods and return to vendor', short: 'Receive' },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    department: 'Purchase',
    pages: 'Vendor list and vendor file',
    abilities: [
      { feature: 'cc_vendors.view', label: 'See vendors', short: 'View' },
      { feature: 'cc_vendors.manage', label: 'Add and edit vendors', short: 'Edit' },
    ],
  },
  {
    key: 'store',
    label: 'Store',
    department: 'Store',
    pages: 'Stock, lots, stock ledger',
    abilities: [
      { feature: 'cc_store.view', label: 'See stock, lots and the ledger', short: 'View' },
      { feature: 'cc_store.adjust', label: 'Add or remove stock by hand, move stock between stores', short: 'Adjust' },
    ],
  },
  {
    key: 'masters',
    label: 'Masters',
    department: 'Admin',
    pages: 'Departments, dropdown lists',
    independent: true,
    abilities: [
      { feature: 'cc_departments.view', label: 'See departments', short: 'Departments' },
      { feature: 'cc_departments.manage', label: 'Add and edit departments', short: 'Edit depts' },
      { feature: 'cc_lists.manage', label: 'Change dropdown lists', short: 'Dropdowns' },
      { feature: 'cc_accounts.series', label: 'Change document number series', short: 'Numbering' },
      { feature: 'cc_orders.settings', label: 'Change workflow stages', short: 'Stages' },
    ],
  },
]

export const ROLE_LABELS: Record<string, { label: string; department: string }> = {
  superadmin: { label: 'Super admin', department: 'System' },
  admin: { label: 'Admin / owner', department: 'Management' },
  employee: { label: 'Employee (basic)', department: 'General' },
  sales: { label: 'Sales', department: 'Sales' },
  accounts: { label: 'Accounts', department: 'Accounts' },
  procurement: { label: 'Purchase', department: 'Purchase' },
  fg_store: { label: 'FG store & despatch', department: 'Store' },
  supervisor: { label: 'Floor supervisor', department: 'Production' },
  quality_control: { label: 'QC & lab', department: 'Quality' },
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
