export type ListDepartment = 'Sales' | 'Accounts' | 'R&D' | 'Artwork' | 'Planning' | 'Purchase' | 'Store' | 'Production' | 'QC' | 'QA' | 'Masters'

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
    key: 'packing_item_types',
    label: 'Packing item types',
    department: 'Masters',
    usedIn: 'Finished good form: packing items made under the product (Carton - <product>, Label - <product>…)',
    defaults: ['Carton', 'Label', 'Tube', 'Bottle', 'Bottle Set', 'Jar', 'Cap', 'Pump', 'Dropper', 'Leaflet', 'Tray', 'Shipper'],
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
    key: 'stock_adjust_reasons',
    label: 'Stock adjustment reasons',
    department: 'Store',
    usedIn: 'Store stock: add or remove stock by hand',
    defaults: ['Opening stock', 'Physical count difference', 'Found in store', 'Damaged', 'Expired', 'Spillage / loss', 'Issued to R&D', 'Issued for other use'],
  },
  {
    key: 'vessels',
    label: 'Vessels / mixing machines',
    department: 'Production',
    usedIn: 'Manufacturing stage (suggested names)',
    defaults: [],
  },
  {
    key: 'filling_machines',
    label: 'Filling machines',
    department: 'Production',
    usedIn: 'Filling stage (suggested names)',
    defaults: [],
  },
  {
    key: 'operators',
    label: 'Operators',
    department: 'Production',
    usedIn: 'Manufacturing and filling stages (suggested names)',
    defaults: [],
  },
  {
    key: 'factory_locations',
    label: 'Factory locations',
    department: 'Production',
    usedIn: 'Packing stage: where finished goods are kept',
    defaults: [],
  },
  {
    key: 'transporters',
    label: 'Transporters',
    department: 'Sales',
    usedIn: 'Dispatch stage (suggested names)',
    defaults: [],
  },
  {
    key: 'qc_classes',
    label: 'QC parameter class',
    department: 'QC',
    usedIn: 'QC rules, parameter table',
    defaults: ['Critical', 'Major', 'Minor'],
  },
  {
    key: 'qa_document_types',
    label: 'QA document types',
    department: 'QA',
    usedIn: 'QA documents register',
    defaults: ['SOP', 'QR format', 'IPQC format', 'Specification', 'Test method', 'Policy', 'Other'],
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
    locked: ['Due on delivery'],
    customField: { entityId: 'customers:customer_company_profile', key: 'payment_terms', valueMap: 'paymentTermKey' },
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
  {
    key: 'rnd_product_types',
    label: 'R&D product types',
    department: 'R&D',
    usedIn: 'R&D request',
    defaults: ['Serum', 'Cream', 'Lotion', 'Gel', 'Face wash', 'Cleanser', 'Toner', 'Sunscreen', 'Shampoo', 'Conditioner', 'Hair oil', 'Mask', 'Scrub', 'Lip care', 'Body wash', 'Body butter'],
  },
  {
    key: 'rnd_formula_phases',
    label: 'Formula phases',
    department: 'R&D',
    usedIn: 'R&D trial formula',
    defaults: ['A · Water phase', 'B · Oil phase', 'C · Cool-down', 'D · Actives', 'E · Fragrance and preservative'],
  },
  {
    key: 'rnd_ingredient_functions',
    label: 'Ingredient functions',
    department: 'R&D',
    usedIn: 'R&D trial formula',
    defaults: ['Solvent', 'Humectant', 'Emollient', 'Emulsifier', 'Thickener', 'Active', 'Preservative', 'Fragrance', 'Colour', 'pH adjuster', 'Chelating agent', 'Antioxidant', 'Surfactant', 'Conditioning agent', 'UV filter'],
  },
  {
    key: 'rnd_test_parameters',
    label: 'R&D lab test parameters',
    department: 'R&D',
    usedIn: 'R&D trial lab results',
    defaults: ['Description', 'Appearance', 'Colour', 'Odour', 'Texture', 'pH', 'Viscosity (cps)', 'Specific gravity', 'Spreadability'],
  },
  {
    key: 'rnd_stability_conditions',
    label: 'Stability conditions',
    department: 'R&D',
    usedIn: 'R&D stability study',
    defaults: ['45 °C', '40 °C / 75% RH', 'Room temperature', '4 °C', 'Freeze-thaw', 'Light'],
  },
  {
    key: 'rnd_stability_checkpoints',
    label: 'Stability checkpoints (days)',
    department: 'R&D',
    usedIn: 'R&D stability study',
    defaults: ['0', '7', '14', '30', '60', '90'],
    fixed: 'Numbers of days from the start of the study.',
  },
  {
    key: 'rnd_stability_parameters',
    label: 'Stability checks',
    department: 'R&D',
    usedIn: 'R&D stability readings',
    defaults: ['Appearance', 'Colour', 'Odour', 'pH', 'Viscosity (cps)', 'Phase separation'],
  },
]

export const LIST_KEYS = LIST_DEFS.map((def) => def.key)

export function listDef(key: string): ListDef | undefined {
  return LIST_DEFS.find((def) => def.key === key)
}

export function listDefaults(key: string): string[] {
  return listDef(key)?.defaults ?? []
}
