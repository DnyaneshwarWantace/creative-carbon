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

@Entity({ tableName: 'cc_upload_batches' })
@Index({ name: 'cc_upload_batches_scope_idx', properties: ['organizationId', 'tenantId', 'registerKey'] })
export class UploadBatch {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'registerDate' | 'errors'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'register_key', type: 'text' })
  registerKey!: string

  @Property({ name: 'file_name', type: 'text' })
  fileName!: string

  @Property({ name: 'file_hash', type: 'text' })
  fileHash!: string

  @Property({ name: 'register_date', type: 'text', nullable: true })
  registerDate?: string | null

  @Property({ name: 'total_rows', type: 'int' })
  totalRows!: number

  @Property({ name: 'created_rows', type: 'int' })
  createdRows!: number

  @Property({ name: 'updated_rows', type: 'int' })
  updatedRows!: number

  @Property({ name: 'failed_rows', type: 'int' })
  failedRows!: number

  @Property({ type: 'json', nullable: true })
  errors?: Array<{ row: number; error: string }> | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type ResinMaterialLine = {
  productId: string
  title: string
  kg: number
  lotId: string | null
  lots: Array<{ lotId: string; lotNumber: string | null; place: string; kg: number }>
}

export type ResinReading = { tempC: number | null; time: string | null }

export type ResinProcess = {
  steps: Record<string, { done: boolean; ph: number | null }>
  startHeating: ResinReading
  stopHeating: ResinReading
  reactionStart: ResinReading
  reactionComplete: ResinReading
  gelChecked: boolean
  vacuumStart: string | null
  coolingDuration: string | null
}

export type ResinTests = { ph: number | null; gelTimeSec: number | null; viscositySec: number | null; solidPct: number | null }

export type PlantHistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type ResinBatchStatus = 'draft' | 'posted' | 'failed'

@Entity({ tableName: 'cc_resin_batches' })
@Index({ name: 'cc_resin_batches_scope_idx', properties: ['organizationId', 'tenantId', 'batchDate'] })
@Index({
  name: 'cc_resin_batches_no_unique_idx',
  expression: 'create unique index "cc_resin_batches_no_unique_idx" on "cc_resin_batches" ("organization_id", "batch_no") where deleted_at is null',
})
export class ResinBatch {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedByName' | 'status' | 'waterRemovedKg' | 'yieldKg' | 'failReason' | 'chemistSign' | 'chemistSignedAt' | 'inchargeSign' | 'inchargeSignedAt' | 'postedAt' | 'postedByName' | 'resinProductId' | 'resinLotId' | 'resinLotNumber' | 'notes' | 'history'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'batch_no', type: 'text' })
  batchNo!: string

  @Property({ name: 'batch_date', type: 'text' })
  batchDate!: string

  @Property({ name: 'reactor_id', type: 'uuid' })
  reactorId!: string

  @Property({ name: 'reactor_code', type: 'text' })
  reactorCode!: string

  @Property({ type: 'text' })
  grade!: string

  @Property({ type: 'json' })
  materials!: ResinMaterialLine[]

  @Property({ type: 'json' })
  process!: ResinProcess

  @Property({ type: 'json' })
  tests!: ResinTests

  @Property({ name: 'water_removed_kg', type: 'numeric', columnType: 'numeric(14,3)', nullable: true })
  waterRemovedKg?: string | null

  @Property({ name: 'yield_kg', type: 'numeric', columnType: 'numeric(14,3)', nullable: true })
  yieldKg?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: ResinBatchStatus = 'draft'

  @Property({ name: 'fail_reason', type: 'text', nullable: true })
  failReason?: string | null

  @Property({ name: 'chemist_sign', type: 'text', nullable: true })
  chemistSign?: string | null

  @Property({ name: 'chemist_signed_at', type: Date, nullable: true })
  chemistSignedAt?: Date | null

  @Property({ name: 'incharge_sign', type: 'text', nullable: true })
  inchargeSign?: string | null

  @Property({ name: 'incharge_signed_at', type: Date, nullable: true })
  inchargeSignedAt?: Date | null

  @Property({ name: 'posted_at', type: Date, nullable: true })
  postedAt?: Date | null

  @Property({ name: 'posted_by_name', type: 'text', nullable: true })
  postedByName?: string | null

  @Property({ name: 'resin_product_id', type: 'uuid', nullable: true })
  resinProductId?: string | null

  @Property({ name: 'resin_lot_id', type: 'uuid', nullable: true })
  resinLotId?: string | null

  @Property({ name: 'resin_lot_number', type: 'text', nullable: true })
  resinLotNumber?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PlantHistoryEntry[] | null

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type ChemicalIssueStatus = 'posted' | 'cancelled'

@Entity({ tableName: 'cc_chemical_issues' })
@Index({ name: 'cc_chemical_issues_scope_idx', properties: ['organizationId', 'tenantId', 'issueDate'] })
export class ChemicalIssue {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'status' | 'dryerCode' | 'note' | 'byName' | 'history' | 'lots'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'issue_date', type: 'text' })
  issueDate!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'product_title', type: 'text' })
  productTitle!: string

  @Property({ type: 'numeric', columnType: 'numeric(14,3)' })
  kg!: string

  @Property({ name: 'used_for', type: 'text' })
  usedFor!: 'coating' | 'other'

  @Property({ name: 'dryer_code', type: 'text', nullable: true })
  dryerCode?: string | null

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ type: 'json', nullable: true })
  lots?: Array<{ lotId: string; lotNumber: string | null; place: string; kg: number }> | null

  @Property({ type: 'text', default: 'posted' })
  status: ChemicalIssueStatus = 'posted'

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PlantHistoryEntry[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type CoatingRow = {
  sn: number
  clothProductId: string
  clothTitle: string
  gsm: number | null
  kushan: number | null
  treatedWeight: number | null
  rawKg: number
  balanceRawKg: number
  coatedNos: number
  resinLotId: string | null
  rcPct: number | null
  vcPct: number | null
  rawLots: Array<{ lotId: string; lotNumber: string | null; place: string; kg: number }>
  resinLots: Array<{ lotId: string; lotNumber: string | null; place: string; kg: number }>
  resinProductId: string | null
  resinBatchNo: string | null
  bstageProductId: string | null
  bstageLotId: string | null
  bstageLotNumber: string | null
  bstageKg: number | null
  resinKg: number | null
}

export type CoatingSlot = { time: string; dbpKg: number | null; oleicKg: number | null; outputKg: number | null }

@Entity({ tableName: 'cc_coating_sheets' })
@Index({ name: 'cc_coating_sheets_scope_idx', properties: ['organizationId', 'tenantId', 'sheetDate'] })
@Index({
  name: 'cc_coating_sheets_day_unique_idx',
  expression: 'create unique index "cc_coating_sheets_day_unique_idx" on "cc_coating_sheets" ("organization_id", "dryer_id", "sheet_date") where deleted_at is null',
})
export class CoatingSheet {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedByName' | 'status' | 'postedAt' | 'postedByName' | 'notes' | 'history' | 'issueIds' | 'warnings'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'sheet_date', type: 'text' })
  sheetDate!: string

  @Property({ name: 'dryer_id', type: 'uuid' })
  dryerId!: string

  @Property({ name: 'dryer_code', type: 'text' })
  dryerCode!: string

  @Property({ type: 'json' })
  rows!: CoatingRow[]

  @Property({ type: 'json' })
  slots!: CoatingSlot[]

  @Property({ type: 'text', default: 'draft' })
  status: 'draft' | 'posted' = 'draft'

  @Property({ name: 'issue_ids', type: 'json', nullable: true })
  issueIds?: string[] | null

  @Property({ type: 'json', nullable: true })
  warnings?: string[] | null

  @Property({ name: 'posted_at', type: Date, nullable: true })
  postedAt?: Date | null

  @Property({ name: 'posted_by_name', type: 'text', nullable: true })
  postedByName?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PlantHistoryEntry[] | null

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type PressSheet = {
  thicknessMm: number
  count: number
  weightKg: number
  weightMinKg: number | null
  grade: string
  tolerance: { minKg: number; maxKg: number } | null
  toleranceOk: boolean | null
}

export type PressDaylight = { no: number; sheets: PressSheet[] }

export type PressLotChoice = { grade: string; lotId: string; reason: string }

export type PressPick = { grade: string; productId: string; lotId: string; lotNumber: string | null; place: string; kg: number; ageDays: number }

export type PressOutput = { grade: string; thicknessMm: number; productId: string; productTitle: string; lotId: string; lotNumber: string; kg: number; nos: number }

export type PressHeating = Record<string, string | number | null>

@Entity({ tableName: 'cc_press_batches' })
@Index({ name: 'cc_press_batches_scope_idx', properties: ['organizationId', 'tenantId', 'batchDate'] })
@Index({
  name: 'cc_press_batches_no_unique_idx',
  expression: 'create unique index "cc_press_batches_no_unique_idx" on "cc_press_batches" ("organization_id", "batch_month", "seq")',
})
export class PressBatch {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'updatedByName' | 'status' | 'cycleNo' | 'checkedBy' | 'remark' | 'reviewedBy' | 'reviewedAt' | 'heating' | 'lotChoices' | 'picks' | 'outputs' | 'warnings' | 'postedAt' | 'postedByName' | 'history' | 'cancelReason'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'batch_no', type: 'text' })
  batchNo!: string

  @Property({ name: 'batch_month', type: 'text' })
  batchMonth!: string

  @Property({ type: 'int' })
  seq!: number

  @Property({ name: 'batch_date', type: 'text' })
  batchDate!: string

  @Property({ name: 'press_id', type: 'uuid' })
  pressId!: string

  @Property({ name: 'press_number', type: 'int' })
  pressNumber!: number

  @Property({ name: 'cycle_no', type: 'int', nullable: true })
  cycleNo?: number | null

  @Property({ type: 'json' })
  daylights!: PressDaylight[]

  @Property({ name: 'lot_choices', type: 'json', nullable: true })
  lotChoices?: PressLotChoice[] | null

  @Property({ type: 'json', nullable: true })
  picks?: PressPick[] | null

  @Property({ type: 'json', nullable: true })
  outputs?: PressOutput[] | null

  @Property({ type: 'json', nullable: true })
  heating?: PressHeating | null

  @Property({ type: 'json', nullable: true })
  warnings?: string[] | null

  @Property({ name: 'checked_by', type: 'text', nullable: true })
  checkedBy?: string | null

  @Property({ type: 'text', nullable: true })
  remark?: string | null

  @Property({ name: 'reviewed_by', type: 'text', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: Date, nullable: true })
  reviewedAt?: Date | null

  @Property({ type: 'text', default: 'draft' })
  status: 'draft' | 'posted' | 'cancelled' = 'draft'

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null

  @Property({ name: 'posted_at', type: Date, nullable: true })
  postedAt?: Date | null

  @Property({ name: 'posted_by_name', type: 'text', nullable: true })
  postedByName?: string | null

  @Property({ type: 'json', nullable: true })
  history?: PlantHistoryEntry[] | null

  @Property({ name: 'updated_by_name', type: 'text', nullable: true })
  updatedByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
