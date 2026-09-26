import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type PaymentKind = 'advance' | 'balance' | 'other'

@Entity({ tableName: 'dermat_order_payments' })
@Index({ name: 'dermat_order_payments_order_idx', properties: ['organizationId', 'tenantId', 'orderId'] })
export class OrderPayment {
  [OptionalProps]?: 'mode' | 'reference' | 'note' | 'byName' | 'voidedAt' | 'voidReason' | 'createdAt' | 'updatedAt'

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

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
