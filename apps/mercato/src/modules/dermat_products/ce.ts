import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import { cf, entityId } from '@open-mercato/shared/modules/dsl'

const PURCHASED = ['raw_material', 'packing_material']

const systemEntities: CustomEntitySpec[] = [
  {
    id: entityId('catalog', 'catalog_product'),
    label: 'Product',
    showInSidebar: false,
    fields: [
      cf.text('item_code', { label: 'Item Code', listVisible: true, filterable: true }),
      cf.text('hsn_code', { label: 'HSN Code' }),
      cf.integer('shelf_life_months', { label: 'Shelf Life (months)' }),
      cf.text('purchase_uom', { label: 'Purchase Unit', formEditable: false }),

      cf.text('inci_name', { label: 'INCI Name', fieldset: 'raw_material', listVisible: true }),
      cf.text('benefit', { label: 'Benefit / Function', fieldset: 'raw_material' }),
      cf.text('alternative', { label: 'Alternative Material', fieldset: 'raw_material' }),
      cf.select('solubility', ['Oil soluble', 'Water soluble'], { label: 'Solubility', fieldset: 'raw_material' }),
      cf.select('physical_state', ['Solid', 'Liquid', 'Semi-solid', 'Powder', 'Gel', 'Paste'], {
        label: 'Physical State',
        fieldsets: ['raw_material', 'bulk'],
      }),

      cf.text('make_brand', { label: 'Make / Brand', fieldsets: PURCHASED }),
      cf.text('supplier', { label: 'Supplier', fieldsets: PURCHASED }),
      cf.text('old_code', { label: 'Old Code', fieldsets: PURCHASED }),
      cf.float('grn_excess_percent', { label: '% Excess GRN Allowed', fieldsets: PURCHASED }),

      cf.select('printed', ['Printed', 'Non-printed'], { label: 'Printed / Non-printed', fieldset: 'packing_material' }),
      cf.text('capacity', { label: 'Size / Capacity', fieldset: 'packing_material' }),
      cf.text('cap_colour', { label: 'Cap Colour', fieldset: 'packing_material' }),
      cf.text('body_colour', { label: 'Body Colour', fieldset: 'packing_material' }),
      cf.select('shape', ['Round', 'Oval'], { label: 'Shape', fieldset: 'packing_material' }),
      cf.select('finish', ['Matt', 'Glossy'], { label: 'Finish', fieldset: 'packing_material' }),
      cf.text('decoration', { label: 'Leafing / UV / Foiling', fieldset: 'packing_material' }),

      cf.float('density', { label: 'Density (g per ml)', fieldsets: ['bulk', 'finished_goods'] }),
      cf.text('brand_name', { label: 'Brand Name', fieldsets: ['packing_material', 'finished_goods', 'rnd'] }),
      cf.float('pack_size', { label: 'Pack Size', fieldset: 'finished_goods' }),
      cf.select('pack_unit', ['ml', 'g', 'kg', 'l', 'nos'], { label: 'Pack Unit', fieldset: 'finished_goods' }),
      cf.currency('mrp', { label: 'MRP', fieldset: 'finished_goods' }),
      cf.text('fragrance', { label: 'Fragrance', fieldset: 'finished_goods' }),
      cf.text('colour', { label: 'Colour', fieldset: 'finished_goods' }),
      cf.text('rd_number', { label: 'R&D No.', fieldsets: ['bulk', 'rnd'] }),
    ],
  },
]

export const entities = systemEntities
export default systemEntities
