import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type StoreKey = 'rm' | 'pm'
export type RequestStatus = 'requested' | 'partly_issued' | 'issued' | 'received' | 'used' | 'cancelled'
export type RequestHistory = { action: string; by: string | null; at: string; note: string | null }
export type LineIssue = {
  lotId: string | null
  lotNumber: string | null
  quantity: number
  used: number
  returned: number
  movementId: string | null
  by: string | null
  at: string
}

@Entity({ tableName: 'dermat_store_requests' })
@Index({ name: 'dermat_store_requests_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'dermat_store_requests_order_idx', properties: ['orderId', 'stageKey'] })
@Unique({ name: 'dermat_store_requests_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class StoreRequest {
  [OptionalProps]?:
    | 'status'
    | 'notes'
    | 'requestedByName'
    | 'receivedByName'
    | 'receivedAt'
    | 'usedAt'
    | 'history'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

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

  @Property({ name: 'stage_key', type: 'text' })
  stageKey!: string

  @Property({ type: 'text' })
  store!: StoreKey

  @Property({ type: 'text', default: 'requested' })
  status: RequestStatus = 'requested'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'requested_by_name', type: 'text', nullable: true })
  requestedByName?: string | null

  @Property({ name: 'received_by_name', type: 'text', nullable: true })
  receivedByName?: string | null

  @Property({ name: 'received_at', type: Date, nullable: true })
  receivedAt?: Date | null

  @Property({ name: 'used_at', type: Date, nullable: true })
  usedAt?: Date | null

  @Property({ type: 'json', nullable: true })
  history?: RequestHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_store_request_lines' })
@Index({ name: 'dermat_store_request_lines_request_idx', properties: ['requestId'] })
@Index({ name: 'dermat_store_request_lines_product_idx', properties: ['organizationId', 'tenantId', 'productId'] })
export class StoreRequestLine {
  [OptionalProps]?: 'issuedQty' | 'receivedQty' | 'usedQty' | 'returnedQty' | 'issues' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'request_id', type: 'uuid' })
  requestId!: string

  @Property({ type: 'int' })
  position!: number

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'variant_id', type: 'uuid' })
  variantId!: string

  @Property({ type: 'text' })
  unit!: string

  @Property({ name: 'required_qty', type: 'decimal', precision: 14, scale: 4 })
  requiredQty!: string

  @Property({ name: 'issued_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  issuedQty: string = '0'

  @Property({ name: 'received_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  receivedQty: string = '0'

  @Property({ name: 'used_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  usedQty: string = '0'

  @Property({ name: 'returned_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  returnedQty: string = '0'

  @Property({ type: 'json', nullable: true })
  issues?: LineIssue[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
