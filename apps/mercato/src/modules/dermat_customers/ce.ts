import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import { cf, entityId } from '@open-mercato/shared/modules/dsl'

const systemEntities: CustomEntitySpec[] = [
  {
    id: entityId('customers', 'customer_company_profile'),
    label: 'Customer Company',
    showInSidebar: false,
    fields: [
      cf.text('customer_no', { label: 'Customer #', listVisible: true, filterable: true }),
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
