import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type PaymentKind = 'advance' | 'balance' | 'other'

@Entity({ tableName: 'dermat_order_payments' })
@Index({ name: 'dermat_order_payments_order_idx', properties: ['organizationId', 'tenantId', 'orderId'] })
export class OrderPayment {
  [OptionalProps]?: 'mode' | 'reference' | 'note' | 'byName' | 'voidedAt' | 'voidReason' | 'invoiceId' | 'invoiceCode' | 'history' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'order_no', type: 'text' })
  orderNo!: string

  @Property({ type: 'text' })
  kind!: PaymentKind

  @Property({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string

  @Property({ name: 'paid_on', type: 'text' })
  paidOn!: string

  @Property({ type: 'text', nullable: true })
  mode?: string | null

  @Property({ type: 'text', nullable: true })
  reference?: string | null

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'voided_at', type: Date, nullable: true })
  voidedAt?: Date | null

  @Property({ name: 'void_reason', type: 'text', nullable: true })
  voidReason?: string | null

  @Property({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId?: string | null

  @Property({ name: 'invoice_code', type: 'text', nullable: true })
  invoiceCode?: string | null

  @Property({ type: 'json', nullable: true })
  history?: Array<{ action: string; by: string | null; at: string; note: string | null }> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'dermat_company_profiles' })
@Index({ name: 'dermat_company_profiles_scope_idx', properties: ['organizationId', 'tenantId'] })
export class CompanyProfile {
  [OptionalProps]?: 'legalName' | 'gstin' | 'pan' | 'address' | 'phone' | 'email' | 'website' | 'bankName' | 'bankBranch' | 'bankAccount' | 'bankIfsc' | 'upiId' | 'signatory' | 'piTerms' | 'invoiceTerms' | 'piValidityDays' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'legal_name', type: 'text', nullable: true })
  legalName?: string | null

  @Property({ type: 'text', nullable: true })
  gstin?: string | null

  @Property({ type: 'text', nullable: true })
  pan?: string | null

  @Property({ type: 'text', nullable: true })
  address?: string | null

  @Property({ type: 'text', nullable: true })
  phone?: string | null

  @Property({ type: 'text', nullable: true })
  email?: string | null

  @Property({ type: 'text', nullable: true })
  website?: string | null

  @Property({ name: 'bank_name', type: 'text', nullable: true })
  bankName?: string | null

  @Property({ name: 'bank_branch', type: 'text', nullable: true })
  bankBranch?: string | null

  @Property({ name: 'bank_account', type: 'text', nullable: true })
  bankAccount?: string | null

  @Property({ name: 'bank_ifsc', type: 'text', nullable: true })
  bankIfsc?: string | null

  @Property({ name: 'upi_id', type: 'text', nullable: true })
  upiId?: string | null

  @Property({ type: 'text', nullable: true })
  signatory?: string | null

  @Property({ name: 'pi_terms', type: 'text', nullable: true })
  piTerms?: string | null

  @Property({ name: 'invoice_terms', type: 'text', nullable: true })
  invoiceTerms?: string | null

  @Property({ name: 'pi_validity_days', type: 'integer', default: 15 })
  piValidityDays: number = 15

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type PiStatus = 'draft' | 'sent' | 'cancelled'
export type PiLine = {
  productId: string
  code: string | null
  title: string
  brandName: string | null
  packSize: string | null
  hsn: string | null
  quantity: number
  rate: number | null
  discountPercent: number
  gstPercent: number
  taxable: number
  gst: number
  total: number
}
export type PiTotals = { gross: number; discount: number; taxable: number; gst: number; total: number }
export type PiHistory = { action: string; by: string | null; at: string; note: string | null }

@Entity({ tableName: 'dermat_proforma_invoices' })
@Index({ name: 'dermat_proforma_invoices_order_idx', properties: ['organizationId', 'tenantId', 'orderId'] })
export class ProformaInvoice {
  [OptionalProps]?: 'customerGstin' | 'validUntil' | 'status' | 'advancePercent' | 'pricesIncludeGst' | 'terms' | 'bankDetails' | 'notes' | 'sentAt' | 'sentByName' | 'createdByName' | 'cancelReason' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'order_no', type: 'text' })
  orderNo!: string

  @Property({ name: 'customer_id', type: 'uuid' })
  customerId!: string

  @Property({ name: 'customer_name', type: 'text' })
  customerName!: string

  @Property({ name: 'customer_gstin', type: 'text', nullable: true })
  customerGstin?: string | null

  @Property({ name: 'pi_date', type: 'text' })
  piDate!: string

  @Property({ name: 'valid_until', type: 'text', nullable: true })
  validUntil?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: PiStatus = 'draft'

  @Property({ name: 'advance_percent', type: 'numeric', precision: 6, scale: 2, nullable: true })
  advancePercent?: string | null

  @Property({ name: 'prices_include_gst', type: 'boolean', default: false })
  pricesIncludeGst: boolean = false

  @Property({ type: 'json' })
  lines!: PiLine[]

  @Property({ type: 'json' })
  totals!: PiTotals

  @Property({ type: 'text', nullable: true })
  terms?: string | null

  @Property({ name: 'bank_details', type: 'text', nullable: true })
  bankDetails?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'sent_by_name', type: 'text', nullable: true })
  sentByName?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PiHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type InvoiceStatus = 'draft' | 'issued' | 'cancelled'
export type InvoiceKind = 'invoice' | 'credit_note'
export type InvoiceLine = PiLine & { orderLineId: string; cgst: number; sgst: number; igst: number }
export type InvoiceTotals = PiTotals & { cgst: number; sgst: number; igst: number; roundOff: number; payable: number }

@Entity({ tableName: 'dermat_tax_invoices' })
@Index({ name: 'dermat_tax_invoices_order_idx', properties: ['organizationId', 'tenantId', 'orderId'] })
export class TaxInvoice {
  [OptionalProps]?: 'kind' | 'againstId' | 'againstCode' | 'customerGstin' | 'customerAddress' | 'dueDate' | 'status' | 'interState' | 'placeOfSupply' | 'pricesIncludeGst' | 'transporter' | 'vehicleNo' | 'lrNo' | 'ewayBillNo' | 'terms' | 'bankDetails' | 'notes' | 'issuedAt' | 'issuedByName' | 'createdByName' | 'cancelReason' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text', default: 'invoice' })
  kind: InvoiceKind = 'invoice'

  @Property({ name: 'against_id', type: 'uuid', nullable: true })
  againstId?: string | null

  @Property({ name: 'against_code', type: 'text', nullable: true })
  againstCode?: string | null

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'order_no', type: 'text' })
  orderNo!: string

  @Property({ name: 'customer_id', type: 'uuid' })
  customerId!: string

  @Property({ name: 'customer_name', type: 'text' })
  customerName!: string

  @Property({ name: 'customer_gstin', type: 'text', nullable: true })
  customerGstin?: string | null

  @Property({ name: 'customer_address', type: 'text', nullable: true })
  customerAddress?: string | null

  @Property({ name: 'invoice_date', type: 'text' })
  invoiceDate!: string

  @Property({ name: 'due_date', type: 'text', nullable: true })
  dueDate?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: InvoiceStatus = 'draft'

  @Property({ name: 'inter_state', type: 'boolean', default: false })
  interState: boolean = false

  @Property({ name: 'place_of_supply', type: 'text', nullable: true })
  placeOfSupply?: string | null

  @Property({ name: 'prices_include_gst', type: 'boolean', default: false })
  pricesIncludeGst: boolean = false

  @Property({ type: 'json' })
  lines!: InvoiceLine[]

  @Property({ type: 'json' })
  totals!: InvoiceTotals

  @Property({ type: 'text', nullable: true })
  transporter?: string | null

  @Property({ name: 'vehicle_no', type: 'text', nullable: true })
  vehicleNo?: string | null

  @Property({ name: 'lr_no', type: 'text', nullable: true })
  lrNo?: string | null

  @Property({ name: 'eway_bill_no', type: 'text', nullable: true })
  ewayBillNo?: string | null

  @Property({ type: 'text', nullable: true })
  terms?: string | null

  @Property({ name: 'bank_details', type: 'text', nullable: true })
  bankDetails?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'issued_at', type: Date, nullable: true })
  issuedAt?: Date | null

  @Property({ name: 'issued_by_name', type: 'text', nullable: true })
  issuedByName?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PiHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
