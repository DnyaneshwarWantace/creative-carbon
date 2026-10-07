import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type RdStatus = 'requested' | 'in_progress' | 'sample_sent' | 'changes' | 'approved' | 'dropped'
export type RdRound = { round: number; madeOn: string | null; sentOn: string | null; sentVia: string | null; feedback: string | null; feedbackOn: string | null; result: 'approved' | 'changes' | null; by: string | null; trialId?: string | null; trialCode?: string | null }
export type RdHistory = { action: string; by: string | null; at: string; note: string | null }
export type RdIngredientRef = { productId: string; code: string | null; name: string }
export type RdTrialStatus = 'draft' | 'testing' | 'passed' | 'failed' | 'approved' | 'rejected'
export type RdStabilityStatus = 'not_started' | 'running' | 'passed' | 'failed'
export type RdFormulaLine = { id: string; phase: string | null; productId: string | null; code: string | null; name: string; function: string | null; percent: number; isBalance: boolean; note: string | null }
export type RdObservations = { values: Record<string, string>; result: 'pass' | 'fail' | null; remarks: string | null; by: string | null; at: string | null }
export type RdReading = { condition: string; day: number; date: string; values: Record<string, string>; result: 'pass' | 'fail'; remarks: string | null; by: string | null; at: string }
export type RdStability = { startDate: string | null; conditions: string[]; checkpoints: number[]; readings: RdReading[]; conclusion: string | null }

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
    | 'clientInstruction'
    | 'textureReference'
    | 'targetPh'
    | 'claims'
    | 'sampleQty'
    | 'ingredientRefs'
    | 'approvedTrialId'
    | 'bomId'
    | 'bomProductId'
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

  @Property({ name: 'client_instruction', type: 'text', nullable: true })
  clientInstruction?: string | null

  @Property({ name: 'texture_reference', type: 'text', nullable: true })
  textureReference?: string | null

  @Property({ name: 'target_ph', type: 'text', nullable: true })
  targetPh?: string | null

  @Property({ type: 'text', nullable: true })
  claims?: string | null

  @Property({ name: 'sample_qty', type: 'text', nullable: true })
  sampleQty?: string | null

  @Property({ name: 'ingredient_refs', type: 'json', nullable: true })
  ingredientRefs?: RdIngredientRef[] | null

  @Property({ name: 'approved_trial_id', type: 'uuid', nullable: true })
  approvedTrialId?: string | null

  @Property({ name: 'bom_id', type: 'uuid', nullable: true })
  bomId?: string | null

  @Property({ name: 'bom_product_id', type: 'uuid', nullable: true })
  bomProductId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_rnd_trials' })
@Index({ name: 'dermat_rnd_trials_request_idx', properties: ['organizationId', 'tenantId', 'requestId'] })
@Unique({ name: 'dermat_rnd_trials_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class RdTrial {
  [OptionalProps]?:
    | 'status'
    | 'batchDate'
    | 'chemistName'
    | 'batchSize'
    | 'batchUnit'
    | 'aim'
    | 'procedure'
    | 'formula'
    | 'observations'
    | 'stability'
    | 'stabilityStatus'
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

  @Property({ name: 'request_id', type: 'uuid' })
  requestId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'trial_no', type: 'int' })
  trialNo!: number

  @Property({ type: 'text', default: 'draft' })
  status: RdTrialStatus = 'draft'

  @Property({ name: 'batch_date', type: 'text', nullable: true })
  batchDate?: string | null

  @Property({ name: 'chemist_name', type: 'text', nullable: true })
  chemistName?: string | null

  @Property({ name: 'batch_size', type: 'numeric', precision: 14, scale: 3, nullable: true })
  batchSize?: string | null

  @Property({ name: 'batch_unit', type: 'text', default: 'g' })
  batchUnit: string = 'g'

  @Property({ type: 'text', nullable: true })
  aim?: string | null

  @Property({ type: 'text', nullable: true })
  procedure?: string | null

  @Property({ type: 'json', nullable: true })
  formula?: RdFormulaLine[] | null

  @Property({ type: 'json', nullable: true })
  observations?: RdObservations | null

  @Property({ type: 'json', nullable: true })
  stability?: RdStability | null

  @Property({ name: 'stability_status', type: 'text', default: 'not_started' })
  stabilityStatus: RdStabilityStatus = 'not_started'

  @Property({ type: 'json', nullable: true })
  history?: RdHistory[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
