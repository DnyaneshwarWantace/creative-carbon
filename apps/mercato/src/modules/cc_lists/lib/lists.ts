export type ListDepartment = 'Sales' | 'Accounts' | 'Purchase' | 'Store' | 'Production' | 'QC' | 'Masters'

export type ListDef = {
  key: string
  label: string
  department: ListDepartment
  usedIn: string
  defaults: string[]
  locked?: string[]
  fixed?: string
  customField?: { entityId: string; key: string; valueMap?: 'paymentTermKey' }
}

export const LIST_DEFS: ListDef[] = [
  {
    key: 'payment_remarks',
    label: 'Payment remarks',
    department: 'Sales',
    usedIn: 'Customer form and customer details',
    defaults: ['30% advance, 70% before despatch', '50% advance, 50% before despatch', '100% advance', 'LC at sight', '30 days credit', '60 days credit', 'As discussed'],
    customField: { entityId: 'customers:customer_company_profile', key: 'payment_remarks' },
  },
  {
    key: 'product_forms',
    label: 'Product form',
    department: 'Sales',
    usedIn: 'Order lines',
    defaults: ['Sheet', 'Tube', 'Rod', 'Moulded part', 'B-stage', 'Raw material', 'Bought-in'],
  },
  {
    key: 'laminate_grades',
    label: 'Laminate grades',
    department: 'Masters',
    usedIn: 'Order lines, press batches, FG inspection',
    defaults: ['F2F3', 'MUS2', 'Fabric', 'Paper', 'Rubber W', 'Coffee P1', 'P2 (m)', 'Graphite'],
  },
  {
    key: 'weaves',
    label: 'Weave / paper',
    department: 'Masters',
    usedIn: 'Order lines, coating, press batches',
    defaults: ['10x10', '6x6', 'G 10x10', 'G 6x6', 'W-10x10', '16x16x54', '16x16x51', '16x16x38'],
  },
  {
    key: 'sheet_sizes',
    label: 'Sheet sizes',
    department: 'Masters',
    usedIn: 'Order lines, FG inspection, despatch weighment',
    defaults: ['8x4', '6x6', '1906x1250'],
  },
  {
    key: 'pack_types',
    label: 'Packing',
    department: 'Store',
    usedIn: 'Order lines, packing & weighment stage',
    defaults: ['Pallet (export)', 'PP wrap + LDP stitch (local)'],
  },
  {
    key: 'test_standards',
    label: 'Test standards',
    department: 'QC',
    usedIn: 'Order lines, QC & test report stage',
    defaults: ['IS 2036', 'NEMA', 'IEC', 'BIS', 'Customer spec'],
  },
  {
    key: 'allocation_status',
    label: 'Stock allocation',
    department: 'Store',
    usedIn: 'Stock allocation stage',
    defaults: ['All from stock', 'Part from stock', 'To be made'],
  },
  {
    key: 'ports',
    label: 'Ports',
    department: 'Sales',
    usedIn: 'Despatch stage',
    defaults: ['Mundra', 'Kandla', 'Nhava Sheva'],
  },
  {
    key: 'hold_parties',
    label: 'On hold because of',
    department: 'Sales',
    usedIn: 'Hold on any order stage',
    defaults: ['Customer side', 'Internal', 'Vendor'],
  },
  {
    key: 'payment_modes',
    label: 'Payment modes',
    department: 'Accounts',
    usedIn: 'Recording payments',
    defaults: ['NEFT / RTGS', 'UPI', 'Cheque', 'LC', 'Other'],
  },
  {
    key: 'stock_adjust_reasons',
    label: 'Stock adjustment reasons',
    department: 'Store',
    usedIn: 'Add or remove stock by hand',
    defaults: ['Opening stock', 'Physical count difference', 'Found in store', 'Damaged', 'Scrap', 'Spillage / loss', 'Issued for other use'],
  },
  {
    key: 'operators',
    label: 'Operators',
    department: 'Production',
    usedIn: 'Plant registers',
    defaults: ['Anjani', 'Anil', 'Nagendra', 'Rajesh', 'Bharat', 'Vinod'],
  },
  {
    key: 'transporters',
    label: 'Transporters',
    department: 'Store',
    usedIn: 'Despatch stage',
    defaults: [],
  },
  {
    key: 'packing_item_types',
    label: 'Packing item types',
    department: 'Masters',
    usedIn: 'Product form (replaced in Stage 1 with the laminate item types)',
    defaults: [],
  },
  {
    key: 'payment_terms',
    label: 'Payment terms',
    department: 'Accounts',
    usedIn: 'Customer form, orders, invoices',
    defaults: ['Due on delivery', '15 days', '30 days', '45 days', '60 days', '90 days'],
    customField: { entityId: 'customers:customer_company_profile', key: 'payment_terms', valueMap: 'paymentTermKey' },
  },
  {
    key: 'gst_types',
    label: 'GST treatment',
    department: 'Accounts',
    usedIn: 'Customer and vendor forms',
    defaults: ['Registered', 'Unregistered', 'Composition', 'Overseas'],
  },
  {
    key: 'gst_rates',
    label: 'GST rates',
    department: 'Accounts',
    usedIn: 'Order lines, invoices',
    defaults: ['0%', '5%', '12%', '18%', '28%'],
  },
  {
    key: 'vendor_categories',
    label: 'Vendor supplies',
    department: 'Purchase',
    usedIn: 'Vendor form',
    defaults: ['Chemicals', 'Cloth / paper', 'Chindi', 'Consumables', 'Bought-in finished goods', 'Transport'],
  },
]

export function listDef(key: string): ListDef | undefined {
  return LIST_DEFS.find((def) => def.key === key)
}

export function listDefaults(key: string): string[] {
  return listDef(key)?.defaults ?? []
}
