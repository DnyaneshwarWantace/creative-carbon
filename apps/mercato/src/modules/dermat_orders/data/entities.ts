import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type OrderStatus = 'booked' | 'confirmed' | 'completed' | 'cancelled'
export type OrderType = 'new' | 'repeat' | 'revision'
export type OrderPriority = 'normal' | 'urgent'

@Entity({ tableName: 'dermat_orders' })
@Index({ name: 'dermat_orders_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dermat_orders_customer_idx', properties: ['customerId'] })
@Unique({ name: 'dermat_orders_org_no_uq', properties: ['organizationId', 'tenantId', 'orderNo'] })
export class DermatOrder {
  [OptionalProps]?:
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

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_order_lines' })
@Index({ name: 'dermat_order_lines_order_idx', properties: ['orderId'] })
@Index({ name: 'dermat_order_lines_product_idx', properties: ['productId'] })
export class DermatOrderLine {
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

@Entity({ tableName: 'dermat_order_stages' })
@Index({ name: 'dermat_order_stages_order_idx', properties: ['orderId'] })
@Index({ name: 'dermat_order_stages_open_idx', properties: ['tenantId', 'organizationId', 'status'] })
@Unique({ name: 'dermat_order_stages_order_key_uq', properties: ['orderId', 'stageKey'] })
export class DermatOrderStage {
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

@Entity({ tableName: 'dermat_order_events' })
@Index({ name: 'dermat_order_events_order_idx', properties: ['orderId'] })
export class DermatOrderEvent {
  [OptionalProps]?: 'stageKey' | 'note' | 'byName' | 'createdAt'

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

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
