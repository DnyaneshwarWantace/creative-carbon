import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type PlanItem = { key: string; orderId: string | null; lineId: string | null; productId: string; quantity: number }

@Entity({ tableName: 'dermat_planning_plans' })
@Index({ name: 'dermat_planning_plans_scope_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'dermat_planning_plans_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class PlanningPlan {
  [OptionalProps]?: 'notes' | 'createdByName' | 'items' | 'storeStatus' | 'sentAt' | 'sentByName' | 'prepareBy' | 'storeNote' | 'storeUpdatedAt' | 'storeByName' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ type: 'json', nullable: true })
  items?: PlanItem[] | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'store_status', type: 'text', nullable: true })
  storeStatus?: 'sent' | 'preparing' | 'ready' | null

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'sent_by_name', type: 'text', nullable: true })
  sentByName?: string | null

  @Property({ name: 'prepare_by', type: 'text', nullable: true })
  prepareBy?: string | null

  @Property({ name: 'store_note', type: 'text', nullable: true })
  storeNote?: string | null

  @Property({ name: 'store_updated_at', type: Date, nullable: true })
  storeUpdatedAt?: Date | null

  @Property({ name: 'store_by_name', type: 'text', nullable: true })
  storeByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_planning_log' })
@Index({ name: 'dermat_planning_log_order_idx', properties: ['organizationId', 'tenantId', 'orderId'] })
@Index({ name: 'dermat_planning_log_product_idx', properties: ['organizationId', 'tenantId', 'productId'] })
export class PlanningLog {
  [OptionalProps]?: 'toOrderId' | 'toOrderNo' | 'note' | 'byName' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  action!: 'reserve' | 'clear' | 'move' | 'issued'

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'order_no', type: 'text' })
  orderNo!: string

  @Property({ name: 'to_order_id', type: 'uuid', nullable: true })
  toOrderId?: string | null

  @Property({ name: 'to_order_no', type: 'text', nullable: true })
  toOrderNo?: string | null

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'dermat_planning_reservations' })
@Index({ name: 'dermat_planning_reservations_product_idx', properties: ['organizationId', 'tenantId', 'productId'] })
@Unique({ name: 'dermat_planning_reservations_order_product_uq', properties: ['organizationId', 'tenantId', 'orderId', 'productId'] })
export class PlanningReservation {
  [OptionalProps]?: 'note' | 'byName' | 'since' | 'createdAt' | 'updatedAt'

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

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ type: Date, onCreate: () => new Date() })
  since: Date = new Date()

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
