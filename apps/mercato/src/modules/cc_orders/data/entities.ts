import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type OrderStatus = 'booked' | 'confirmed' | 'completed' | 'cancelled'
export type OrderType = 'new' | 'repeat' | 'revision'
export type OrderPriority = 'normal' | 'urgent'

export type FieldChange = { key: string; label: string; from: string | number | null; to: string | number | null }

@Entity({ tableName: 'cc_orders' })
@Index({ name: 'cc_orders_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'cc_orders_customer_idx', properties: ['customerId'] })
@Unique({ name: 'cc_orders_org_no_uq', properties: ['organizationId', 'tenantId', 'orderNo'] })
export class CcOrder {
  [OptionalProps]?:
    | 'market'
    | 'incoterm'
    | 'portOfLoading'
    | 'country'
    | 'currency'
    | 'status'
    | 'orderType'
    | 'deliveryDate'
    | 'customerPoRef'
    | 'sourceOrderId'
    | 'salesManager'
    | 'paymentTerms'
    | 'paymentRemarks'
    | 'productRemarks'
    | 'billingRemarks'
    | 'packingRemarks'
    | 'pricesIncludeGst'
    | 'priority'
    | 'billingAddress'
    | 'shippingAddress'
    | 'revisedAt'
    | 'revisedByName'
    | 'revisionNote'
    | 'revision'
    | 'heldAt'
    | 'holdReason'
    | 'heldByName'
    | 'createdByName'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_no', type: 'text' })
  orderNo!: string

  @Property({ name: 'order_date', type: 'date' })
  orderDate!: string

  @Property({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: string | null

  @Property({ name: 'customer_id', type: 'uuid' })
  customerId!: string

  @Property({ name: 'customer_po_ref', type: 'text', nullable: true })
  customerPoRef?: string | null

  @Property({ name: 'order_type', type: 'text', default: 'new' })
  orderType: OrderType = 'new'

  @Property({ name: 'source_order_id', type: 'uuid', nullable: true })
  sourceOrderId?: string | null

  @Property({ name: 'sales_manager', type: 'text', nullable: true })
  salesManager?: string | null

  @Property({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms?: string | null

  @Property({ type: 'text', default: 'domestic' })
  market: 'domestic' | 'export' = 'domestic'

  @Property({ type: 'text', nullable: true })
  incoterm?: string | null

  @Property({ name: 'port_of_loading', type: 'text', nullable: true })
  portOfLoading?: string | null

  @Property({ type: 'text', nullable: true })
  country?: string | null

  @Property({ type: 'text', nullable: true })
  currency?: string | null

  @Property({ name: 'payment_remarks', type: 'text', nullable: true })
  paymentRemarks?: string | null

  @Property({ name: 'product_remarks', type: 'text', nullable: true })
  productRemarks?: string | null

  @Property({ name: 'billing_remarks', type: 'text', nullable: true })
  billingRemarks?: string | null

  @Property({ name: 'packing_remarks', type: 'text', nullable: true })
  packingRemarks?: string | null

  @Property({ name: 'prices_include_gst', type: 'boolean', default: false })
  pricesIncludeGst: boolean = false

  @Property({ type: 'text', default: 'booked' })
  status: OrderStatus = 'booked'

  @Property({ type: 'text', default: 'normal' })
  priority: OrderPriority = 'normal'

  @Property({ name: 'billing_address', type: 'text', nullable: true })
  billingAddress?: string | null

  @Property({ name: 'shipping_address', type: 'text', nullable: true })
  shippingAddress?: string | null

  @Property({ name: 'revised_at', type: Date, nullable: true })
  revisedAt?: Date | null

  @Property({ name: 'revised_by_name', type: 'text', nullable: true })
  revisedByName?: string | null

  @Property({ name: 'revision_note', type: 'text', nullable: true })
  revisionNote?: string | null

  @Property({ type: 'integer', default: 1 })
  revision: number = 1

  @Property({ name: 'held_at', type: Date, nullable: true })
  heldAt?: Date | null

  @Property({ name: 'hold_reason', type: 'text', nullable: true })
  holdReason?: string | null

  @Property({ name: 'held_by_name', type: 'text', nullable: true })
  heldByName?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'cc_order_lines' })
@Index({ name: 'cc_order_lines_order_idx', properties: ['orderId'] })
@Index({ name: 'cc_order_lines_product_idx', properties: ['productId'] })
export class CcOrderLine {
  [OptionalProps]?: 'brandName' | 'packSize' | 'mrp' | 'rate' | 'gstPercent' | 'discountPercent' | 'batchNo' | 'sampleNeeded' | 'rdNumber' | 'specs' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ type: 'int' })
  position!: number

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'brand_name', type: 'text', nullable: true })
  brandName?: string | null

  @Property({ name: 'pack_size', type: 'text', nullable: true })
  packSize?: string | null

  @Property({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  mrp?: string | null

  @Property({ type: 'numeric', precision: 14, scale: 3 })
  quantity!: string

  @Property({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  rate?: string | null

  @Property({ name: 'gst_percent', type: 'numeric', precision: 6, scale: 2, default: '18' })
  gstPercent: string = '18'

  @Property({ name: 'discount_percent', type: 'numeric', precision: 6, scale: 2, default: '0' })
  discountPercent: string = '0'

  @Property({ name: 'batch_no', type: 'text', nullable: true })
  batchNo?: string | null

  @Property({ name: 'sample_needed', type: 'boolean', default: false })
  sampleNeeded: boolean = false

  @Property({ name: 'rd_number', type: 'text', nullable: true })
  rdNumber?: string | null

  @Property({ type: 'json', nullable: true })
  specs?: Record<string, Record<string, string>> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_order_stages' })
@Index({ name: 'cc_order_stages_order_idx', properties: ['orderId'] })
@Index({ name: 'cc_order_stages_open_idx', properties: ['tenantId', 'organizationId', 'status'] })
@Unique({ name: 'cc_order_stages_order_key_uq', properties: ['orderId', 'stageKey'] })
export class CcOrderStage {
  [OptionalProps]?:
    | 'status'
    | 'responsibleUserId'
    | 'responsibleName'
    | 'data'
    | 'holdReason'
    | 'holdParty'
    | 'openedAt'
    | 'completedAt'
    | 'completedByName'
    | 'createdAt'
    | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'stage_key', type: 'text' })
  stageKey!: string

  @Property({ type: 'text', default: 'waiting' })
  status: string = 'waiting'

  @Property({ name: 'responsible_user_id', type: 'uuid', nullable: true })
  responsibleUserId?: string | null

  @Property({ name: 'responsible_name', type: 'text', nullable: true })
  responsibleName?: string | null

  @Property({ type: 'json', nullable: true })
  data?: Record<string, unknown> | null

  @Property({ name: 'hold_reason', type: 'text', nullable: true })
  holdReason?: string | null

  @Property({ name: 'hold_party', type: 'text', nullable: true })
  holdParty?: string | null

  @Property({ name: 'opened_at', type: Date, nullable: true })
  openedAt?: Date | null

  @Property({ name: 'completed_at', type: Date, nullable: true })
  completedAt?: Date | null

  @Property({ name: 'completed_by_name', type: 'text', nullable: true })
  completedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_order_events' })
@Index({ name: 'cc_order_events_order_idx', properties: ['orderId'] })
export class CcOrderEvent {
  [OptionalProps]?: 'stageKey' | 'note' | 'byName' | 'changes' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'stage_key', type: 'text', nullable: true })
  stageKey?: string | null

  @Property({ type: 'text' })
  action!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ type: 'json', nullable: true })
  changes?: FieldChange[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'cc_stage_settings' })
@Unique({ name: 'cc_stage_settings_scope_uq', properties: ['organizationId', 'tenantId', 'stageKey'] })
export class CcStageSetting {
  [OptionalProps]?: 'label' | 'dayLimit' | 'reopenHours' | 'hiddenSteps' | 'requiredFields' | 'extraFields' | 'documents' | 'extraDocuments' | 'sharedFields' | 'defaultUserId' | 'defaultUserName' | 'updatedByName' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'stage_key', type: 'text' })
  stageKey!: string

  @Property({ type: 'text', nullable: true })
  label?: string | null

  @Property({ name: 'day_limit', type: 'integer', nullable: true })
  dayLimit?: number | null

  @Property({ name: 'reopen_hours', type: 'integer', nullable: true })
  reopenHours?: number | null

  @Property({ name: 'hidden_steps', type: 'json', nullable: true })
  hiddenSteps?: string[] | null

  @Property({ name: 'required_fields', type: 'json', nullable: true })
  requiredFields?: string[] | null

  @Property({ name: 'extra_fields', type: 'json', nullable: true })
  extraFields?: Array<{ key: string; label: string; type: string; options?: string[]; required?: boolean }> | null

  @Property({ type: 'json', nullable: true })
  documents?: Record<string, 'always' | 'optional'> | null

  @Property({ name: 'extra_documents', type: 'json', nullable: true })
  extraDocuments?: Array<{ key: string; label: string; required: boolean }> | null

  @Property({ name: 'shared_fields', type: 'json', nullable: true })
  sharedFields?: string[] | null

  @Property({ name: 'default_user_id', type: 'uuid', nullable: true })
  defaultUserId?: string | null

  @Property({ name: 'default_user_name', type: 'text', nullable: true })
  defaultUserName?: string | null

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_order_allocations' })
@Index({ name: 'cc_order_allocations_order_idx', properties: ['organizationId', 'orderId'] })
@Index({ name: 'cc_order_allocations_lot_idx', properties: ['organizationId', 'lotId'] })
export class CcOrderAllocation {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'reservationId' | 'status' | 'shippedQty' | 'byName' | 'shipments'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'line_id', type: 'uuid' })
  lineId!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'lot_id', type: 'uuid' })
  lotId!: string

  @Property({ name: 'lot_number', type: 'text' })
  lotNumber!: string

  @Property({ type: 'text' })
  place!: string

  @Property({ type: 'numeric', precision: 14, scale: 3 })
  qty!: string

  @Property({ type: 'text' })
  unit!: string

  @Property({ name: 'reservation_id', type: 'uuid', nullable: true })
  reservationId?: string | null

  @Property({ type: 'text', default: 'reserved' })
  status: 'reserved' | 'shipped' | 'released' = 'reserved'

  @Property({ name: 'shipped_qty', type: 'numeric', precision: 14, scale: 3, default: '0' })
  shippedQty: string = '0'

  @Property({ type: 'json', nullable: true })
  shipments?: Array<{ qty: number; at: string; by: string | null }> | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_order_packings' })
@Index({ name: 'cc_order_packings_order_idx', properties: ['organizationId', 'orderId'] })
export class CcOrderPacking {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'line_id', type: 'uuid' })
  lineId!: string

  @Property({ type: 'json' })
  weights!: number[]

  @Property({ name: 'packed_qty', type: 'numeric', precision: 14, scale: 3 })
  packedQty!: string

  @Property({ type: 'text' })
  unit!: string

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
