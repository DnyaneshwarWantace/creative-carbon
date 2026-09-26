export type ListDepartment = 'Sales' | 'Accounts' | 'R&D' | 'Artwork' | 'Planning' | 'Purchase' | 'Production' | 'QC' | 'QA' | 'Masters'

export type ListDef = {
  key: string
  label: string
  department: ListDepartment
  usedIn: string
  defaults: string[]
  locked?: string[]
  fixed?: string
  customField?: { entityId: string; key: string }
}

export const LIST_DEFS: ListDef[] = [
  {
    key: 'payment_remarks',
    label: 'Payment remarks',
    department: 'Sales',
    usedIn: 'Customer form and customer details',
    defaults: ['40% advance 60% before dispatch', '50% advance and 50% before dispatch', '30% Advance 70% before Dispatch', '25% Advance and 75% Before Dispatch', '20% ADVANCE', '60DAYS CREDIT', '90 DAYS', 'As Discussed'],
    customField: { entityId: 'customers:customer_company_profile', key: 'payment_remarks' },
  },
  {
    key: 'tube_shape',
    label: 'Tube shape',
    department: 'Sales',
    usedIn: 'New order, tube / bottle specs',
    defaults: ['Round', 'Oval'],
  },
  {
    key: 'tube_decoration',
    label: 'Tube decoration',
    department: 'Sales',
    usedIn: 'New order, tube / bottle specs',
    defaults: ['Labelled', 'Printed'],
  },
  {
    key: 'tube_finish',
    label: 'Tube finish',
    department: 'Sales',
    usedIn: 'New order, tube / bottle specs',
    defaults: ['Matt', 'Glossy'],
  },
  {
    key: 'hold_parties',
    label: 'On hold because of',
    department: 'Sales',
    usedIn: 'Put an order stage on hold',
    defaults: ['Client side', 'Internal', 'Vendor'],
  },
  {
    key: 'payment_modes',
    label: 'Payment modes',
    department: 'Accounts',
    usedIn: 'Record payment, payments list, order money card',
    defaults: ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Other'],
  },
  {
    key: 'client_feedback',
    label: 'Client feedback on sample',
    department: 'R&D',
    usedIn: 'Sampling stage',
    defaults: ['Approved', 'Changes needed', 'Waiting'],
    locked: ['Approved'],
  },
  {
    key: 'designer_statuses',
    label: 'Designer / packing status',
    department: 'Artwork',
    usedIn: 'Artwork stage, status per packing item',
    defaults: ['ORDERED', 'PM OK', 'Client Side', 'Artwork', 'Half PM OK', 'Hold', 'Need to Order PM'],
    locked: ['PM OK', 'Half PM OK'],
  },
  {
    key: 'material_status',
    label: 'Material status',
    department: 'Planning',
    usedIn: 'Planning stage',
    defaults: ['All available', 'Purchase raised', 'Waiting for material'],
  },
  {
    key: 'shifts',
    label: 'Shifts',
    department: 'Production',
    usedIn: 'Manufacturing and filling stages',
    defaults: ['A', 'B', 'C', 'General'],
  },
  {
    key: 'qc_classes',
    label: 'QC parameter class',
    department: 'QC',
    usedIn: 'QC rules, parameter table',
    defaults: ['Critical', 'Major', 'Minor'],
  },
  {
    key: 'qa_decision',
    label: 'QA decision',
    department: 'QA',
    usedIn: 'QA release stage',
    defaults: ['Released', 'Rework', 'Rejected'],
    fixed: 'Each decision starts a different path: release to billing, send back to production, or write the batch off.',
  },
  {
    key: 'bulk_source',
    label: 'Bulk source',
    department: 'Production',
    usedIn: 'Manufacturing stage',
    defaults: ['Make a new batch', 'Use bulk already made'],
    fixed: 'Decides whether raw materials are issued or existing bulk is used.',
  },
  {
    key: 'balance_status',
    label: 'Balance payment',
    department: 'Accounts',
    usedIn: 'Billing stage',
    defaults: ['Received', 'Pending'],
    fixed: 'Dispatch is blocked while the balance is Pending.',
  },
  {
    key: 'payment_terms',
    label: 'Payment terms',
    department: 'Sales',
    usedIn: 'Customers, orders, invoice due dates',
    defaults: ['Due on delivery', '15 days', '30 days', '45 days', '60 days', '90 days'],
    fixed: 'Invoice due dates and the dues list are calculated from these days.',
  },
  {
    key: 'gst_types',
    label: 'GST treatment',
    department: 'Sales',
    usedIn: 'Customer form',
    defaults: ['Registered', 'Unregistered', 'Composition', 'Overseas'],
    fixed: 'Set by GST law; decides whether a GSTIN is required.',
  },
  {
    key: 'gst_rates',
    label: 'GST rates',
    department: 'Accounts',
    usedIn: 'Order lines, purchase orders, invoices',
    defaults: ['0%', '5%', '12%', '18%', '28%'],
    fixed: 'GST slabs used in every tax calculation.',
  },
  {
    key: 'fill_units',
    label: 'Fill units',
    department: 'Masters',
    usedIn: 'Pack BOM fill size',
    defaults: ['ml', 'g', 'l', 'kg'],
    fixed: 'Used to convert fill size into kg of bulk.',
  },
  {
    key: 'vendor_categories',
    label: 'Vendor supplies',
    department: 'Purchase',
    usedIn: 'Vendors',
    defaults: ['Raw material supplier', 'Packing material supplier', 'RM and PM supplier'],
    fixed: 'Decides which store a vendor delivers to.',
  },
]

export const LIST_KEYS = LIST_DEFS.map((def) => def.key)

export function listDef(key: string): ListDef | undefined {
  return LIST_DEFS.find((def) => def.key === key)
}

export function listDefaults(key: string): string[] {
  return listDef(key)?.defaults ?? []
}
