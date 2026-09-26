import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type RdStatus = 'requested' | 'in_progress' | 'sample_sent' | 'changes' | 'approved' | 'dropped'
export type RdRound = { round: number; madeOn: string | null; sentOn: string | null; sentVia: string | null; feedback: string | null; feedbackOn: string | null; result: 'approved' | 'changes' | null; by: string | null }
export type RdHistory = { action: string; by: string | null; at: string; note: string | null }

@Entity({ tableName: 'dermat_rnd_requests' })
@Index({ name: 'dermat_rnd_requests_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Unique({ name: 'dermat_rnd_requests_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class RdRequest {
  [OptionalProps]?:
    | 'kind'
    | 'status'
    | 'customerId'
    | 'customerName'
    | 'orderId'
    | 'orderNo'
    | 'brand'
    | 'productType'
    | 'ingredients'
    | 'texture'
    | 'fragrance'
    | 'colour'
    | 'packSize'
    | 'notes'
    | 'rounds'
    | 'requestedByName'
    | 'assignedName'
    | 'dueDate'
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

  @Property({ type: 'text', default: 'client' })
  kind: 'client' | 'npd' = 'client'

  @Property({ type: 'text', default: 'requested' })
  status: RdStatus = 'requested'

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ name: 'customer_name', type: 'text', nullable: true })
  customerName?: string | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_no', type: 'text', nullable: true })
  orderNo?: string | null

  @Property({ name: 'product_name', type: 'text' })
  productName!: string

  @Property({ type: 'text', nullable: true })
  brand?: string | null

  @Property({ name: 'product_type', type: 'text', nullable: true })
  productType?: string | null

  @Property({ type: 'text', nullable: true })
  ingredients?: string | null

  @Property({ type: 'text', nullable: true })
  texture?: string | null

  @Property({ type: 'text', nullable: true })
  fragrance?: string | null

  @Property({ type: 'text', nullable: true })
  colour?: string | null

  @Property({ name: 'pack_size', type: 'text', nullable: true })
  packSize?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'due_date', type: 'text', nullable: true })
  dueDate?: string | null

  @Property({ type: 'json', nullable: true })
  rounds?: RdRound[] | null

  @Property({ name: 'requested_by_name', type: 'text', nullable: true })
  requestedByName?: string | null

  @Property({ name: 'assigned_name', type: 'text', nullable: true })
  assignedName?: string | null

  @Property({ type: 'json', nullable: true })
  history?: RdHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
