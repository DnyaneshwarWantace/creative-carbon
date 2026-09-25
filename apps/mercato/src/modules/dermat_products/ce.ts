import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import { cf, entityId } from '@open-mercato/shared/modules/dsl'

const systemEntities: CustomEntitySpec[] = [
  {
    id: entityId('catalog', 'catalog_product'),
    label: 'Product',
    showInSidebar: false,
    fields: [
      cf.text('item_code', { label: 'Code', listVisible: true, filterable: true }),
      cf.text('hsn_code', { label: 'HSN Code' }),
      cf.text('product_type', { label: 'Product Type' }),
      cf.currency('selling_price', { label: 'Selling Price' }),
      cf.currency('cost_price', { label: 'Cost Price' }),

      cf.text('inci_name', { label: 'INCI Name', fieldset: 'raw_material', listVisible: true }),
      cf.text('benefit', { label: 'Benefit', fieldset: 'raw_material' }),
      cf.text('alternative', { label: 'Alternative', fieldset: 'raw_material' }),

      cf.text('make_brand', { label: 'Make / Brand', fieldsets: ['raw_material', 'packing_material'] }),
      cf.text('supplier', { label: 'Supplier', fieldsets: ['raw_material', 'packing_material'] }),

      cf.text('capacity', { label: 'Size / Capacity', fieldset: 'packing_material' }),
      cf.text('cap_colour', { label: 'Cap Colour', fieldset: 'packing_material' }),
      cf.text('body_colour', { label: 'Body Colour', fieldset: 'packing_material' }),

      cf.text('brand_name', { label: 'Brand Name', fieldsets: ['finished_goods', 'rnd'] }),
      cf.text('pack_size', { label: 'Pack Size', fieldset: 'finished_goods' }),
      cf.currency('mrp', { label: 'MRP', fieldset: 'finished_goods' }),

      cf.text('rd_number', { label: 'R&D No.', fieldsets: ['bulk', 'rnd'] }),
      cf.float('specific_gravity', { label: 'Specific Gravity (g/ml)', fieldsets: ['bulk', 'rnd', 'raw_material'] }),
    ],
  },
]

export const entities = systemEntities
export default systemEntities
