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
