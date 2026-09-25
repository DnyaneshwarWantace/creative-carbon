import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type StageSubjectType = 'order' | 'order_line'
export type StageKind = 'form' | 'qc_test' | 'production_output'
export type StageRunStatus = 'in_progress' | 'completed' | 'reverted' | 'skipped'
export type StageFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'

export type StageFieldDefinition = {
  key: string
  label: string
  type: StageFieldType
  required?: boolean
  options?: string[]
  unit?: string | null
}

export type QcParameterDefinition = {
  parameter: string
  classification: string
  specification: string
}

export type StageDefinitionConfig = {
  qcParameters?: QcParameterDefinition[]
  issuesMaterial?: 'raw_material' | 'packaging_material'
}

@Entity({ tableName: 'dermat_stage_definitions' })
@Index({ name: 'dermat_stage_definitions_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'dermat_stage_definitions_org_tenant_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class StageDefinition {
  [OptionalProps]?: 'isActive' | 'isOptional' | 'fields' | 'config' | 'createdAt' | 'updatedAt' | 'deletedAt'

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

  @Property({ name: 'subject_type', type: 'text' })
  subjectType!: StageSubjectType

  @Property({ type: 'text', nullable: true })
  phase?: string | null

  @Property({ name: 'phase_label', type: 'text', nullable: true })
  phaseLabel?: string | null

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ type: 'integer' })
  sequence!: number

  @Property({ type: 'text' })
  department!: string

  @Property({ type: 'text' })
  kind!: StageKind

  @Property({ type: 'jsonb', default: '[]' })
  fields: StageFieldDefinition[] = []

  @Property({ type: 'jsonb', default: '{}' })
  config: StageDefinitionConfig = {}

  @Property({ name: 'is_optional', type: 'boolean', default: false })
  isOptional: boolean = false

  @Property({ name: 'is_automatic', type: 'boolean', default: false })
  isAutomatic: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_stage_runs' })
@Index({ name: 'dermat_stage_runs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dermat_stage_runs_order_idx', properties: ['orderId'] })
@Index({ name: 'dermat_stage_runs_subject_idx', properties: ['subjectType', 'subjectId', 'stageCode'] })
@Index({ name: 'dermat_stage_runs_status_idx', properties: ['organizationId', 'status', 'stageCode'] })
export class StageRun {
  [OptionalProps]?: 'status' | 'data' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid' })
  orderId!: string

  @Property({ name: 'order_number', type: 'text', nullable: true })
  orderNumber?: string | null

  @Property({ name: 'customer_name', type: 'text', nullable: true })
  customerName?: string | null

  @Property({ name: 'subject_type', type: 'text' })
  subjectType!: StageSubjectType

  @Property({ name: 'subject_id', type: 'uuid' })
  subjectId!: string

  @Property({ name: 'stage_code', type: 'text' })
  stageCode!: string

  @Property({ type: 'text' })
  status: StageRunStatus = 'in_progress'

  @Property({ type: 'jsonb', default: '{}' })
  data: Record<string, unknown> = {}

  @Property({ name: 'batch_number', type: 'text', nullable: true })
  batchNumber?: string | null

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'product_name', type: 'text', nullable: true })
  productName?: string | null

  @Property({ name: 'product_code', type: 'text', nullable: true })
  productCode?: string | null

  @Property({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  quantity?: string | null

  @Property({ name: 'started_at', type: Date, nullable: true })
  startedAt?: Date | null

  @Property({ name: 'completed_at', type: Date, nullable: true })
  completedAt?: Date | null

  @Property({ name: 'completed_by', type: 'text', nullable: true })
  completedBy?: string | null

  @Property({ name: 'revert_reason', type: 'text', nullable: true })
  revertReason?: string | null

  @Property({ name: 'reverted_at', type: Date, nullable: true })
  revertedAt?: Date | null

  @Property({ name: 'reverted_by', type: 'text', nullable: true })
  revertedBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type ReservationMaterialKind = 'raw_material' | 'packaging_material'
export type ReservationStatus = 'active' | 'consumed' | 'released'

/**
 * Stock held for a specific order without debiting it (client: "reserve the
 * stock, they should not debit the stock"). Stock only goes down when the store
 * issues the material to production, which consumes the reservation.
 */
@Entity({ tableName: 'dermat_stock_reservations' })
@Index({ name: 'dermat_stock_reservations_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dermat_stock_reservations_material_idx', properties: ['materialKind', 'materialId', 'status'] })
@Index({ name: 'dermat_stock_reservations_order_idx', properties: ['orderId', 'status'] })
export class StockReservation {
  [OptionalProps]?: 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_number', type: 'text', nullable: true })
  orderNumber?: string | null

  @Property({ name: 'plan_id', type: 'uuid', nullable: true })
  planId?: string | null

  @Property({ name: 'plan_number', type: 'text', nullable: true })
  planNumber?: string | null

  @Property({ name: 'material_kind', type: 'text' })
  materialKind!: ReservationMaterialKind

  @Property({ name: 'material_id', type: 'uuid' })
  materialId!: string

  @Property({ name: 'material_code', type: 'text', nullable: true })
  materialCode?: string | null

  @Property({ name: 'material_name', type: 'text', nullable: true })
  materialName?: string | null

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ type: 'numeric', precision: 18, scale: 4 })
  quantity!: string

  @Property({ type: 'text' })
  status: ReservationStatus = 'active'

  @Property({ name: 'reserved_by', type: 'text', nullable: true })
  reservedBy?: string | null

  @Property({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date | null

  @Property({ name: 'closed_by', type: 'text', nullable: true })
  closedBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type MaterialPlanStatus = 'draft' | 'requested' | 'completed' | 'cancelled'

/** A planning run: several BOMs (with how much to make) planned together. */
@Entity({ tableName: 'dermat_material_plans' })
@Index({ name: 'dermat_material_plans_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'dermat_material_plans_number_uq', properties: ['organizationId', 'tenantId', 'planNumber'] })
export class MaterialPlan {
  [OptionalProps]?: 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'plan_number', type: 'text' })
  planNumber!: string

  @Property({ type: 'text', nullable: true })
  name?: string | null

  @Property({ type: 'text' })
  status: MaterialPlanStatus = 'draft'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_material_plan_items' })
@Index({ name: 'dermat_material_plan_items_plan_idx', properties: ['planId'] })
export class MaterialPlanItem {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'plan_id', type: 'uuid' })
  planId!: string

  @Property({ name: 'bom_id', type: 'uuid' })
  bomId!: string

  @Property({ name: 'bom_name', type: 'text', nullable: true })
  bomName?: string | null

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_number', type: 'text', nullable: true })
  orderNumber?: string | null

  @Property({ name: 'quantity_pcs', type: 'numeric', precision: 18, scale: 4 })
  quantityPcs!: string

  @Property({ name: 'pack_size_grams', type: 'numeric', precision: 18, scale: 4, nullable: true })
  packSizeGrams?: string | null

  @Property({ name: 'bulk_kg', type: 'numeric', precision: 18, scale: 4 })
  bulkKg!: string

  @Property({ type: 'integer', default: 0 })
  sequence: number = 0

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type MaterialRequestStatus = 'requested' | 'issued' | 'cancelled'

/** Request sent from planning to the RM store or PM store: "we need this much". */
@Entity({ tableName: 'dermat_material_requests' })
@Index({ name: 'dermat_material_requests_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dermat_material_requests_plan_idx', properties: ['planId'] })
@Unique({ name: 'dermat_material_requests_number_uq', properties: ['organizationId', 'tenantId', 'requestNumber'] })
export class MaterialRequest {
  [OptionalProps]?: 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'request_number', type: 'text' })
  requestNumber!: string

  @Property({ name: 'plan_id', type: 'uuid' })
  planId!: string

  @Property({ name: 'plan_number', type: 'text', nullable: true })
  planNumber?: string | null

  @Property({ type: 'text' })
  store!: ReservationMaterialKind

  @Property({ type: 'text' })
  status: MaterialRequestStatus = 'requested'

  @Property({ name: 'requested_by', type: 'text', nullable: true })
  requestedBy?: string | null

  @Property({ name: 'issued_by', type: 'text', nullable: true })
  issuedBy?: string | null

  @Property({ name: 'issued_at', type: Date, nullable: true })
  issuedAt?: Date | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_material_request_lines' })
@Index({ name: 'dermat_material_request_lines_request_idx', properties: ['requestId'] })
export class MaterialRequestLine {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'request_id', type: 'uuid' })
  requestId!: string

  @Property({ name: 'material_id', type: 'uuid' })
  materialId!: string

  @Property({ name: 'material_code', type: 'text', nullable: true })
  materialCode?: string | null

  @Property({ name: 'material_name', type: 'text', nullable: true })
  materialName?: string | null

  @Property({ type: 'text', nullable: true })
  unit?: string | null

  @Property({ name: 'required_qty', type: 'numeric', precision: 18, scale: 4 })
  requiredQty!: string

  @Property({ name: 'stock_at_request', type: 'numeric', precision: 18, scale: 4 })
  stockAtRequest!: string

  @Property({ name: 'issued_qty', type: 'numeric', precision: 18, scale: 4, nullable: true })
  issuedQty?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
