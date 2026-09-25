import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import { cf, entityId } from '@open-mercato/shared/modules/dsl'

const systemEntities: CustomEntitySpec[] = [
  {
    id: entityId('sales', 'sales_order'),
    label: 'Sales Order',
    showInSidebar: false,
    fields: [
      // Existing fields (previously declared ad hoc via customFields payloads,
      // now given a proper typed declaration so they list/filter/inject correctly).
      cf.currency('advance_received_amount', { label: 'Advance received' }),
      cf.date('advance_received_at', { label: 'Advance received on' }),
      cf.text('proforma_invoice_number', { label: 'Proforma invoice #' }),
      cf.boolean('transport_arranged', { label: 'Transport arranged' }),
      cf.text('source_deal_id', { label: 'Source deal', listVisible: false, formEditable: false }),

      // Order Wizard — Step A: Customer
      cf.text('gstin', { label: 'GSTIN' }),
      cf.text('contact_person', { label: 'Contact person' }),
      cf.phone('contact_phone', { label: 'Phone' }),
      cf.text('contact_email', { label: 'Email' }),
      cf.text('sales_poc', { label: 'Sales POC' }),

      // Order Wizard — Step B: Order commercial
      cf.text('customer_po_reference', { label: 'Customer PO / Reference' }),
      cf.select('order_type', ['new', 'repeat', 'revision'], { label: 'Order type' }),
      cf.select('order_source', ['direct', 'referral', 'repeat', 'website', 'other'], { label: 'Order source' }),
      cf.text('company_brand_name', { label: 'Company / Brand name' }),

      // Order Wizard — Step D: Packaging & artwork requirement
      cf.text('packaging_type', { label: 'Packaging type' }),
      cf.text('primary_packaging', { label: 'Primary packaging' }),
      cf.boolean('artwork_required', { label: 'Artwork required' }),
      cf.select('artwork_source', ['customer', 'internal_designer', 'existing_approved'], { label: 'Artwork source' }),
      cf.boolean('printing_required', { label: 'Printing required' }),
      cf.select('artwork_status', ['not_started', 'in_review', 'changes', 'qa', 'final', 'released'], { label: 'Artwork status' }),
      cf.text('designer_status', { label: 'Designer status' }),

      // Order Wizard — Step E: R&D / Sample request
      cf.boolean('sample_required', { label: 'Sample required' }),
      cf.multiline('rd_request', { label: 'R&D request' }),
      cf.float('initial_sample_qty', { label: 'Initial sample qty' }),
      cf.date('sample_due_date', { label: 'Sample due date' }),
      cf.boolean('existing_approved_formulation', { label: 'Existing approved formulation' }),
      cf.text('rd_no', { label: 'R&D No.' }),

      // Order Wizard — Step F: Payment
      cf.boolean('advance_required', { label: 'Advance required' }),
      cf.float('advance_percent', { label: 'Advance %' }),
      cf.text('payment_ref', { label: 'Payment reference' }),

      // Fields confirmed in the field dictionary but owned by later stages —
      // declared now so Order 360 has a home for them once those modules exist.
      cf.select('qa_approval', ['pending', 'approved', 'rejected'], { label: 'QA approval' }),
      cf.date('qa_approval_date', { label: 'QA approval date' }),
      cf.boolean('sent_to_printing', { label: 'Sent to printing' }),
      cf.multiline('billing_remarks', { label: 'Billing remarks' }),
      cf.integer('priority', { label: 'Priority' }),

      // Kanban stage-gate mechanism (spec §5.2). `order_stage` formalizes the pipeline
      // position previously stored as an untyped ad hoc customField; every write to it MUST
      // go through the `dermat_sales_flow.orders.transition_stage` command, never a raw
      // sales/orders PATCH, so the advance/verify/sample-sent gates cannot be bypassed.
      cf.select('order_stage', [
        'new',
        'advance_payment',
        'verified',
        'rnd_sample',
        'artwork_packaging',
        'procurement_material',
        'production',
        'qc_qa',
        'billing_payment',
        'ready_to_dispatch',
        'dispatched_completed',
      ], { label: 'Pipeline stage' }),
      cf.boolean('order_verified', { label: 'Order verified' }),
      cf.text('order_verified_by', { label: 'Verified by' }),
      cf.date('order_verified_at', { label: 'Verified at' }),
      cf.multiline('order_verify_note', { label: 'Verification note' }),
      cf.boolean('rnd_sample_sent_confirmed', { label: 'Sample sent confirmed' }),
      cf.date('rnd_sample_sent_at', { label: 'Sample sent at' }),
      cf.multiline('rnd_sample_sent_note', { label: 'Sample sent note' }),
    ],
  },
  {
    id: entityId('sales', 'sales_order_line'),
    label: 'Sales Order Line',
    showInSidebar: false,
    fields: [
      // Existing fields (previously declared ad hoc via customFields payloads).
      cf.select('line_kind', ['fg', 'rm'], { label: 'Line kind' }),
      cf.text('rm_material_id', { label: 'Raw material', listVisible: false, formEditable: false }),

      // Order Wizard — Step C: Product lines
      cf.text('variant_sku', { label: 'Variant / SKU' }),
      cf.text('brand_name', { label: 'Brand name' }),
      cf.text('pack_size', { label: 'Pack size' }),
      cf.text('uom', { label: 'UOM' }),
      cf.currency('mrp', { label: 'MRP' }),
      cf.currency('unit_price', { label: 'Unit price' }),
      cf.text('batch_no', { label: 'Batch no.' }),
    ],
  },
  {
    id: entityId('catalog', 'catalog_product'),
    label: 'Product',
    showInSidebar: false,
    fields: [
      // One product master for every item kind. The product's
      // `customFieldsetCode` (the category picked on the form) selects which
      // fieldset below is shown; fields without a fieldset show for every
      // category. Admins add / hide / remove fields per category from the
      // form's "Manage fields" dialog — removed fields are soft-deleted and
      // restorable. Field set sourced from the old RM / PM store masters,
      // Procuzy's Add New Product screen and the client's recordings.

      // Every category
      cf.text('product_code', { label: 'Product Code', listVisible: true, filterable: true }),
      cf.text('internal_id', { label: 'Internal Reference ID' }),
      cf.text('hsn_code', { label: 'HSN / SAC Code' }),
      cf.text('gst_tax_category', { label: 'GST %' }),
      cf.text('base_uom', { label: 'Base UOM' }),
      cf.float('min_floor_qty', { label: 'Minimum Floor Quantity' }),
      cf.integer('shelf_life_months', { label: 'Shelf Life (months)' }),

      // Raw Material
      cf.text('inci_name', { label: 'INCI Name', fieldset: 'raw_material' }),
      cf.select('physical_state', ['Solid', 'Liquid', 'Semi-solid', 'Powder', 'Gel', 'Paste'], { label: 'Physical State', fieldset: 'raw_material' }),
      cf.text('benefit', { label: 'Benefit / Function', fieldset: 'raw_material' }),
      cf.text('alternate_rm', { label: 'Alternate RM', fieldset: 'raw_material' }),

      // Packing Material
      cf.select('pm_type', ['Bottle', 'Jar', 'Tube', 'Pump', 'Cap', 'Carton', 'Label', 'Shipper', 'Sachet'], { label: 'PM Type', fieldset: 'packing_material' }),
      cf.text('dimensions', { label: 'Dimensions', fieldset: 'packing_material' }),

      // Raw Material + Packing Material (purchased items)
      cf.text('make_brand_name', { label: 'Make / Brand', fieldsets: ['raw_material', 'packing_material'] }),
      cf.text('supplier', { label: 'Supplier', fieldsets: ['raw_material', 'packing_material'] }),
      cf.float('grn_excess_percent', { label: '% Excess GRN Allowed', fieldsets: ['raw_material', 'packing_material'] }),

      // Bulk (semi-finished formulation)
      cf.text('pack_size', { label: 'Pack Size', fieldset: 'bulk' }),

      // Finished Goods
      cf.float('qty_in_ml', { label: 'Qty in ML', fieldset: 'finished_goods' }),
      cf.float('mrp', { label: 'MRP (₹)', fieldset: 'finished_goods' }),

      // Kept in sync automatically from the chosen category — not typed in.
      cf.text('category', { label: 'Category Label', formEditable: false }),
      cf.select('product_category_group', ['raw_material', 'packing_material', 'finished_goods', 'bulk', 'rnd'], {
        label: 'Product Category Group',
        listVisible: true,
        filterable: true,
        formEditable: false,
      }),

      // Parked (hidden) — never seen filled in the client's recordings. An
      // admin can switch any of them on from "Manage fields".
      cf.text('first_batch_no', { label: 'First Batch No.', formEditable: false }),
      cf.text('carton_vendor', { label: 'Carton Vendor', formEditable: false }),
      cf.text('tube_vendor', { label: 'Tube Vendor', formEditable: false }),
      cf.text('fragrance', { label: 'Fragrance', formEditable: false }),
      cf.text('printing_details', { label: 'Printing Details', formEditable: false }),
      cf.text('packing_code', { label: 'Packing Code', formEditable: false }),
      cf.text('colour', { label: 'Colour', formEditable: false }),
    ],
  },
  {
    id: entityId('catalog', 'catalog_product_variant'),
    label: 'Product Variant',
    showInSidebar: false,
    fields: [
      cf.text('pack_size', { label: 'Pack Size' }),
      cf.text('uom', { label: 'UOM' }),
      cf.currency('mrp', { label: 'MRP' }),
      cf.text('shelf_life', { label: 'Shelf Life' }),
    ],
  },
  {
    id: entityId('customers', 'customer_company_profile'),
    label: 'Customer Company',
    showInSidebar: false,
    fields: [
      cf.select('customer_type_category', ['business', 'individual'], {
        label: 'Customer Category',
        defaultValue: 'business',
        listVisible: true,
      }),
      cf.text('legal_trade_name', { label: 'Legal / Trade Name', listVisible: true }),
      cf.select('gst_registration_type', ['unregistered', 'registered', 'composition', 'overseas'], {
        label: 'Customer Type',
        defaultValue: 'unregistered',
        listVisible: true,
        filterable: true,
      }),
      cf.text('gstin', { label: 'GSTIN', listVisible: true }),
      cf.currency('default_currency', { label: 'Currencies', defaultValue: 'INR', listVisible: true }),
      cf.select('payment_terms', ['due_on_delivery', '15_days', '30_days', '45_days', '60_days', '90_days'], {
        label: 'Payment Terms',
        defaultValue: 'due_on_delivery',
        listVisible: true,
      }),
      cf.select('payment_remarks', [
        '90 DAYS',
        '60DAYS CREDIT',
        'As Discussed',
        '20% ADVANCE',
        '25% Advance and 75% Before Dispatch',
        '40% advance 60% before dispatch',
        '50% advance and 50% before dispatch',
        '30% Advance 70% before Dispatch',
      ], {
        label: 'Payment Remarks',
        listVisible: true,
      }),
      cf.text('sales_manager', { label: 'Sales Manager', listVisible: true }),
    ],
  },
]

export const entities = systemEntities
export default systemEntities
