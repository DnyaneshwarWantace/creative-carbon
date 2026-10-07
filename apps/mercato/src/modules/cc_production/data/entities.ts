import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

type Common = 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedByName'

@Entity({ tableName: 'cc_reactors' })
@Index({ name: 'cc_reactors_scope_idx', properties: ['organizationId', 'tenantId'] })
export class Reactor {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'capacityKg' | 'notes'

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'capacity_kg', type: 'numeric', columnType: 'numeric(12,3)', nullable: true })
  capacityKg?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}

@Entity({ tableName: 'cc_dryers' })
@Index({ name: 'cc_dryers_scope_idx', properties: ['organizationId', 'tenantId'] })
export class Dryer {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'notes'

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  kind!: 'dryer' | 'mixer'

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}

@Entity({ tableName: 'cc_presses' })
@Index({ name: 'cc_presses_scope_idx', properties: ['organizationId', 'tenantId'] })
export class Press {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'daylights' | 'isWorking' | 'notes'

  @Property({ type: 'int' })
  number!: number

  @Property({ name: 'press_type', type: 'text' })
  pressType!: 'small' | 'big'

  @Property({ type: 'int', nullable: true })
  daylights?: number | null

  @Property({ type: 'text' })
  usage!: 'laminate' | 'moulding' | 'both'

  @Property({ name: 'is_working', type: 'boolean', default: true })
  isWorking: boolean = true

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}

@Entity({ tableName: 'cc_moulds' })
@Index({ name: 'cc_moulds_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'cc_moulds_die_idx', properties: ['organizationId', 'tenantId', 'dieNo'] })
export class Mould {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'description' | 'size' | 'finish' | 'thicknessMm' | 'customerId' | 'customerMouldNo' | 'storeLocation' | 'heatUpMinutes'

  @Property({ name: 'die_no', type: 'text' })
  dieNo!: string

  @Property({ name: 'mould_type', type: 'text' })
  mouldType!: 'die' | 'plate'

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ type: 'text', nullable: true })
  size?: string | null

  @Property({ type: 'text', nullable: true })
  finish?: string | null

  @Property({ name: 'thickness_mm', type: 'numeric', columnType: 'numeric(6,2)', nullable: true })
  thicknessMm?: string | null

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ name: 'customer_mould_no', type: 'text', nullable: true })
  customerMouldNo?: string | null

  @Property({ name: 'store_location', type: 'text', nullable: true })
  storeLocation?: string | null

  @Property({ name: 'heat_up_minutes', type: 'int', nullable: true })
  heatUpMinutes?: number | null
}

@Entity({ tableName: 'cc_loading_tolerances' })
@Index({ name: 'cc_loading_tolerances_scope_idx', properties: ['organizationId', 'tenantId'] })
export class LoadingTolerance {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'notes'

  @Property({ name: 'thickness_mm', type: 'numeric', columnType: 'numeric(6,2)' })
  thicknessMm!: string

  @Property({ name: 'min_kg', type: 'numeric', columnType: 'numeric(12,3)' })
  minKg!: string

  @Property({ name: 'max_kg', type: 'numeric', columnType: 'numeric(12,3)' })
  maxKg!: string

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}

@Entity({ tableName: 'cc_price_rates' })
@Index({ name: 'cc_price_rates_scope_idx', properties: ['organizationId', 'tenantId'] })
export class PriceRate {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  [OptionalProps]?: Common | 'thicknessFrom' | 'thicknessTo' | 'notes'

  @Property({ name: 'size_class', type: 'text' })
  sizeClass!: 'small' | 'big'

  @Property({ type: 'text' })
  grade!: string

  @Property({ name: 'thickness_from', type: 'numeric', columnType: 'numeric(6,2)', nullable: true })
  thicknessFrom?: string | null

  @Property({ name: 'thickness_to', type: 'numeric', columnType: 'numeric(6,2)', nullable: true })
  thicknessTo?: string | null

  @Property({ name: 'rate_per_kg', type: 'numeric', columnType: 'numeric(14,2)' })
  ratePerKg!: string

  @Property({ type: 'text' })
  currency!: string

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}
