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

      cf.text('used_in', { label: 'Used in', fieldset: 'chemical' }),
      cf.text('make_brand', { label: 'Make / Brand', fieldsets: ['chemical', 'reinforcement'] }),
      cf.text('supplier', { label: 'Usual supplier', fieldsets: ['chemical', 'reinforcement', 'chindi', 'bought_in'] }),

      cf.text('material_kind', { label: 'Paper or cloth', fieldset: 'reinforcement', listVisible: true }),
      cf.float('gsm', { label: 'GSM', fieldset: 'reinforcement', listVisible: true }),
      cf.text('weave', { label: 'Weave', fieldsets: ['reinforcement', 'laminate'], listVisible: true }),

      cf.text('resin_grade', { label: 'Resin grade', fieldsets: ['resin', 'bstage'] }),
      cf.float('solid_content_target', { label: 'Solid content target (%)', fieldset: 'resin' }),

      cf.text('base_material', { label: 'Base cloth / paper', fieldset: 'bstage' }),
      cf.float('shelf_life_days', { label: 'Shelf life (days)', fieldset: 'bstage' }),
      cf.float('max_use_days', { label: 'Usable up to (days)', fieldset: 'bstage' }),
      cf.float('rc_min', { label: 'RC % min', fieldset: 'bstage' }),
      cf.float('rc_max', { label: 'RC % max', fieldset: 'bstage' }),
      cf.float('vc_min', { label: 'VC % min', fieldset: 'bstage' }),
      cf.float('vc_max', { label: 'VC % max', fieldset: 'bstage' }),

      cf.text('product_form', { label: 'Form', fieldset: 'laminate', listVisible: true }),
      cf.text('laminate_grade', { label: 'Grade', fieldset: 'laminate', listVisible: true }),
      cf.float('thickness_mm', { label: 'Thickness (mm)', fieldset: 'laminate' }),
      cf.text('sheet_size', { label: 'Sheet size', fieldset: 'laminate' }),
      cf.text('test_standard', { label: 'Standard', fieldset: 'laminate' }),

      cf.text('die_no', { label: 'Die No.', fieldset: 'moulded', listVisible: true }),
      cf.float('article_weight_kg', { label: 'Weight of article (kg)', fieldset: 'moulded' }),
      cf.text('customer_name', { label: 'Customer', fieldset: 'moulded' }),

      cf.text('resale', { label: 'Bought for resale', fieldset: 'bought_in' }),
    ],
  },
]

export const entities = systemEntities
export default systemEntities
