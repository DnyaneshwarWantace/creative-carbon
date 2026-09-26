import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type QcOperation = 'purchase_receipt' | 'bulk' | 'filling' | 'packing'
export type QcPartStatus = 'pending' | 'pass' | 'fail' | 'na'
export type QcParameter = { key: string; name: string; class: string; spec: string; test: 'chemical' | 'micro'; min?: number | null; max?: number | null; unit?: string | null }
export type QcResult = QcParameter & { observation: string; remark: string; instrument?: string | null; inSpec?: boolean | null }
export type QcWorksheet = {
  sampledBy?: string | null
  sampledAt?: string | null
  sampleQty?: string | null
  sampleRef?: string | null
  platedAt?: string | null
  incubationDays?: number | null
  retentionQty?: string | null
  retentionLocation?: string | null
  retentionKeptBy?: string | null
  notes?: string | null
}
export type QcHistory = { action: string; by: string | null; at: string; note: string | null }

@Entity({ tableName: 'dermat_quality_rules' })
@Index({ name: 'dermat_quality_rules_scope_idx', properties: ['organizationId', 'tenantId', 'operation'] })
@Unique({ name: 'dermat_quality_rules_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class QcRule {
  [OptionalProps]?: 'productId' | 'requiresChemical' | 'requiresMicro' | 'isActive' | 'parameters' | 'notes' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  title!: string

  @Property({ type: 'text' })
  operation!: QcOperation

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'requires_chemical', type: 'boolean', default: true })
  requiresChemical: boolean = true

  @Property({ name: 'requires_micro', type: 'boolean', default: false })
  requiresMicro: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ type: 'json', nullable: true })
  parameters?: QcParameter[] | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_quality_checks' })
@Index({ name: 'dermat_quality_checks_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'dermat_quality_checks_order_idx', properties: ['orderId', 'stageKey'] })
@Unique({ name: 'dermat_quality_checks_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class QcCheck {
  [OptionalProps]?:
    | 'orderId'
    | 'orderNo'
    | 'stageKey'
    | 'arNo'
    | 'round'
    | 'worksheet'
    | 'batchNo'
    | 'ruleId'
    | 'requiresChemical'
    | 'requiresMicro'
    | 'chemicalStatus'
    | 'microStatus'
    | 'status'
    | 'results'
    | 'chemicalBy'
    | 'chemicalAt'
    | 'microBy'
    | 'microAt'
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

  @Property({ type: 'text' })
  operation!: QcOperation

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_no', type: 'text', nullable: true })
  orderNo?: string | null

  @Property({ name: 'stage_key', type: 'text', nullable: true })
  stageKey?: string | null

  @Property({ name: 'batch_no', type: 'text', nullable: true })
  batchNo?: string | null

  @Property({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId?: string | null

  @Property({ name: 'requires_chemical', type: 'boolean', default: true })
  requiresChemical: boolean = true

  @Property({ name: 'requires_micro', type: 'boolean', default: false })
  requiresMicro: boolean = false

  @Property({ name: 'chemical_status', type: 'text', default: 'pending' })
  chemicalStatus: QcPartStatus = 'pending'

  @Property({ name: 'micro_status', type: 'text', default: 'na' })
  microStatus: QcPartStatus = 'na'

  @Property({ type: 'text', default: 'pending' })
  status: 'pending' | 'passed' | 'failed' | 'reworked' | 'rejected' = 'pending'

  @Property({ name: 'ar_no', type: 'text', nullable: true })
  arNo?: string | null

  @Property({ type: 'integer', default: 1 })
  round: number = 1

  @Property({ type: 'json', nullable: true })
  worksheet?: QcWorksheet | null

  @Property({ type: 'json', nullable: true })
  results?: QcResult[] | null

  @Property({ name: 'chemical_by', type: 'text', nullable: true })
  chemicalBy?: string | null

  @Property({ name: 'chemical_at', type: Date, nullable: true })
  chemicalAt?: Date | null

  @Property({ name: 'micro_by', type: 'text', nullable: true })
  microBy?: string | null

  @Property({ name: 'micro_at', type: Date, nullable: true })
  microAt?: Date | null

  @Property({ type: 'json', nullable: true })
  history?: QcHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
