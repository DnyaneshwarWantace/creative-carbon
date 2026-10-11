import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type ParallelRow = { productId: string; title: string; code: string | null; unit: string; paper: number | null; system: number; diff: number | null; matched: boolean | null }

@Entity({ tableName: 'cc_parallel_checks' })
@Index({ name: 'cc_parallel_checks_scope_idx', properties: ['organizationId', 'tenantId', 'checkDate'] })
@Unique({ name: 'cc_parallel_checks_day_place_uq', properties: ['organizationId', 'tenantId', 'checkDate', 'place'] })
export class ParallelCheck {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'note' | 'byName'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'check_date', type: 'text' })
  checkDate!: string

  @Property({ type: 'text' })
  place!: string

  @Property({ type: 'json' })
  rows!: ParallelRow[]

  @Property({ type: 'integer' })
  counted!: number

  @Property({ type: 'integer' })
  matched!: number

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type StoreHistory = { action: string; by: string | null; at: string; note: string | null }
export type AdjustmentKind = 'add' | 'remove' | 'move'
export type AdjustmentStatus = 'pending' | 'posted' | 'rejected' | 'reversed'

@Entity({ tableName: 'cc_store_adjustments' })
@Index({ name: 'cc_store_adjustments_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'cc_store_adjustments_lot_idx', properties: ['lotId'] })
export class StoreAdjustment {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'toPlace' | 'note' | 'unit' | 'lotId' | 'lotNumber' | 'newLot' | 'movementId' | 'reversalId' | 'createdByName' | 'createdByUserId' | 'approvedByName' | 'approvedAt' | 'reversedByName' | 'reversedAt' | 'reverseReason' | 'history' | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  kind!: AdjustmentKind

  @Property({ type: 'text' })
  place!: string

  @Property({ name: 'to_place', type: 'text', nullable: true })
  toPlace?: string | null

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ type: 'text' })
  title!: string

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId?: string | null

  @Property({ name: 'lot_number', type: 'text', nullable: true })
  lotNumber?: string | null

  @Property({ name: 'new_lot', type: 'json', nullable: true })
  newLot?: { lotNumber: string; expiryDate?: string | null; mfgDate?: string | null } | null

  @Property({ type: 'numeric', precision: 14, scale: 4 })
  quantity!: string

  @Property({ type: 'text' })
  reason!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ type: 'text', default: 'posted' })
  status: AdjustmentStatus = 'posted'

  @Property({ name: 'movement_id', type: 'uuid', nullable: true })
  movementId?: string | null

  @Property({ name: 'reversal_id', type: 'uuid', nullable: true })
  reversalId?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null

  @Property({ name: 'approved_by_name', type: 'text', nullable: true })
  approvedByName?: string | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ name: 'reversed_by_name', type: 'text', nullable: true })
  reversedByName?: string | null

  @Property({ name: 'reversed_at', type: Date, nullable: true })
  reversedAt?: Date | null

  @Property({ name: 'reverse_reason', type: 'text', nullable: true })
  reverseReason?: string | null

  @Property({ type: 'json', nullable: true })
  history?: StoreHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type StocktakeStatus = 'counted' | 'approved' | 'posted' | 'reversed'
export type StocktakeLine = { lotId: string; lotNumber: string; productId: string; title: string; unit: string | null; book: number; counted: number; difference: number; movementId?: string | null }

@Entity({ tableName: 'cc_stocktakes' })
@Index({ name: 'cc_stocktakes_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class Stocktake {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'note' | 'countedByName' | 'approvedByName' | 'approvedAt' | 'postedByName' | 'postedAt' | 'reversedByName' | 'reversedAt' | 'reverseReason' | 'history' | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  place!: string

  @Property({ name: 'count_date', type: 'text' })
  countDate!: string

  @Property({ type: 'text', default: 'counted' })
  status: StocktakeStatus = 'counted'

  @Property({ type: 'json' })
  lines!: StocktakeLine[]

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'counted_by_name', type: 'text', nullable: true })
  countedByName?: string | null

  @Property({ name: 'approved_by_name', type: 'text', nullable: true })
  approvedByName?: string | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ name: 'posted_by_name', type: 'text', nullable: true })
  postedByName?: string | null

  @Property({ name: 'posted_at', type: Date, nullable: true })
  postedAt?: Date | null

  @Property({ name: 'reversed_by_name', type: 'text', nullable: true })
  reversedByName?: string | null

  @Property({ name: 'reversed_at', type: Date, nullable: true })
  reversedAt?: Date | null

  @Property({ name: 'reverse_reason', type: 'text', nullable: true })
  reverseReason?: string | null

  @Property({ type: 'json', nullable: true })
  history?: StoreHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
