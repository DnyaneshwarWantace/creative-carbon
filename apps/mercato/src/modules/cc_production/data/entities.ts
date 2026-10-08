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

export type MouldingStatus = 'draft' | 'posted'

@Entity({ tableName: 'cc_moulding_entries' })
@Index({ name: 'cc_moulding_entries_scope_idx', properties: ['organizationId', 'tenantId', 'entryDate'] })
@Index({ name: 'cc_moulding_entries_mould_idx', properties: ['organizationId', 'mouldId'] })
@Index({
  name: 'cc_moulding_entries_cell_unique_idx',
  expression: 'create unique index "cc_moulding_entries_cell_unique_idx" on "cc_moulding_entries" ("organization_id", "entry_date", "shift", "press_id") where deleted_at is null',
})
export class MouldingEntry {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedByName' | 'status' | 'dieHeatTime' | 'orderQty' | 'orderRef' | 'priorMade' | 'chindiProductId' | 'chindiKg' | 'clothProductId' | 'clothKg' | 'clothNote' | 'bstageGrade' | 'bstageKg' | 'startTime' | 'operatorName' | 'topTemp' | 'bottomTemp' | 'curingTime' | 'picks' | 'outputProductId' | 'outputLotId' | 'outputLotNumber' | 'postedAt' | 'postedByName' | 'history' | 'customerName'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'entry_date', type: 'text' })
  entryDate!: string

  @Property({ type: 'int' })
  shift!: number

  @Property({ name: 'press_id', type: 'uuid' })
  pressId!: string

  @Property({ name: 'press_number', type: 'int' })
  pressNumber!: number

  @Property({ name: 'mould_id', type: 'uuid' })
  mouldId!: string

  @Property({ name: 'die_no', type: 'text' })
  dieNo!: string

  @Property({ name: 'customer_name', type: 'text', nullable: true })
  customerName?: string | null

  @Property({ name: 'die_heat_time', type: 'text', nullable: true })
  dieHeatTime?: string | null

  @Property({ name: 'order_qty', type: 'int', nullable: true })
  orderQty?: number | null

  @Property({ name: 'order_ref', type: 'text', nullable: true })
  orderRef?: string | null

  @Property({ name: 'prior_made', type: 'int', nullable: true })
  priorMade?: number | null

  @Property({ name: 'article_weight_kg', type: 'numeric', columnType: 'numeric(12,3)' })
  articleWeightKg!: string

  @Property({ name: 'chindi_product_id', type: 'uuid', nullable: true })
  chindiProductId?: string | null

  @Property({ name: 'chindi_kg', type: 'numeric', columnType: 'numeric(12,3)', nullable: true })
  chindiKg?: string | null

  @Property({ name: 'cloth_product_id', type: 'uuid', nullable: true })
  clothProductId?: string | null

  @Property({ name: 'cloth_kg', type: 'numeric', columnType: 'numeric(12,3)', nullable: true })
  clothKg?: string | null

  @Property({ name: 'cloth_note', type: 'text', nullable: true })
  clothNote?: string | null

  @Property({ name: 'bstage_grade', type: 'text', nullable: true })
  bstageGrade?: string | null

  @Property({ name: 'bstage_kg', type: 'numeric', columnType: 'numeric(12,3)', nullable: true })
  bstageKg?: string | null

  @Property({ name: 'production_nos', type: 'int' })
  productionNos!: number

  @Property({ name: 'start_time', type: 'text', nullable: true })
  startTime?: string | null

  @Property({ name: 'operator_name', type: 'text', nullable: true })
  operatorName?: string | null

  @Property({ name: 'top_temp', type: 'text', nullable: true })
  topTemp?: string | null

  @Property({ name: 'bottom_temp', type: 'text', nullable: true })
  bottomTemp?: string | null

  @Property({ name: 'curing_time', type: 'text', nullable: true })
  curingTime?: string | null

  @Property({ type: 'json', nullable: true })
  picks?: PressPick[] | null

  @Property({ name: 'output_product_id', type: 'uuid', nullable: true })
  outputProductId?: string | null

  @Property({ name: 'output_lot_id', type: 'uuid', nullable: true })
  outputLotId?: string | null

  @Property({ name: 'output_lot_number', type: 'text', nullable: true })
  outputLotNumber?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: MouldingStatus = 'draft'

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

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'cc_moulding_signoffs' })
@Index({
  name: 'cc_moulding_signoffs_unique_idx',
  expression: 'create unique index "cc_moulding_signoffs_unique_idx" on "cc_moulding_signoffs" ("organization_id", "entry_date", "shift")',
})
export class MouldingSignoff {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'shiftIncharge' | 'shiftInchargeAt' | 'storeIncharge' | 'storeInchargeAt' | 'authorised' | 'authorisedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'entry_date', type: 'text' })
  entryDate!: string

  @Property({ type: 'int' })
  shift!: number

  @Property({ name: 'shift_incharge', type: 'text', nullable: true })
  shiftIncharge?: string | null

  @Property({ name: 'shift_incharge_at', type: Date, nullable: true })
  shiftInchargeAt?: Date | null

  @Property({ name: 'store_incharge', type: 'text', nullable: true })
  storeIncharge?: string | null

  @Property({ name: 'store_incharge_at', type: Date, nullable: true })
  storeInchargeAt?: Date | null

  @Property({ type: 'text', nullable: true })
  authorised?: string | null

  @Property({ name: 'authorised_at', type: Date, nullable: true })
  authorisedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type CutSheet = { no: number; weightKg: number }

export type FgRow = {
  sr: number
  sourceLotId: string
  sourceProductId: string
  sourceLotNumber: string | null
  batchNo: string | null
  itemTitle: string
  sheetSize: string | null
  thicknessMm: number | null
  qtyNos: number
  rejectNos: number
  rejectReason: string | null
  disposition: 'stock' | 'export' | 'allocation'
  customerId: string | null
  customerName: string | null
  passKg: number | null
  rejectKg: number | null
  outputLotId: string | null
  outputLotNumber: string | null
}

@Entity({ tableName: 'cc_cutting_entries' })
@Index({ name: 'cc_cutting_entries_scope_idx', properties: ['organizationId', 'tenantId', 'entryDate'] })
export class CuttingEntry {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'outputLotId' | 'outputLotNumber' | 'status' | 'warnings' | 'notes' | 'sourceLotNumber'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'entry_date', type: 'text' })
  entryDate!: string

  @Property({ name: 'source_product_id', type: 'uuid' })
  sourceProductId!: string

  @Property({ name: 'source_lot_id', type: 'uuid' })
  sourceLotId!: string

  @Property({ name: 'source_lot_number', type: 'text', nullable: true })
  sourceLotNumber?: string | null

  @Property({ name: 'sheets_in', type: 'int' })
  sheetsIn!: number

  @Property({ name: 'source_kg_used', type: 'numeric', columnType: 'numeric(14,3)' })
  sourceKgUsed!: string

  @Property({ name: 'cut_size', type: 'text' })
  cutSize!: string

  @Property({ type: 'json' })
  sheets!: CutSheet[]

  @Property({ name: 'trimmed_kg', type: 'numeric', columnType: 'numeric(14,3)' })
  trimmedKg!: string

  @Property({ name: 'trim_kg', type: 'numeric', columnType: 'numeric(14,3)' })
  trimKg!: string

  @Property({ name: 'trim_pct', type: 'numeric', columnType: 'numeric(14,3)' })
  trimPct!: string

  @Property({ name: 'output_lot_id', type: 'uuid', nullable: true })
  outputLotId?: string | null

  @Property({ name: 'output_lot_number', type: 'text', nullable: true })
  outputLotNumber?: string | null

  @Property({ type: 'text', default: 'posted' })
  status: 'posted' | 'reversed' = 'posted'

  @Property({ type: 'json', nullable: true })
  warnings?: string[] | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

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
@Entity({ tableName: 'cc_thickness_inspections' })
@Index({ name: 'cc_thickness_inspections_scope_idx', properties: ['organizationId', 'tenantId', 'inspectDate'] })
export class ThicknessInspection {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'lotId' | 'productId' | 'grade' | 'daylight' | 'minusMm' | 'plusMm' | 'outOfTolerance' | 'inspector' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'inspect_date', type: 'text' })
  inspectDate!: string

  @Property({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId?: string | null

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'lot_ref', type: 'text' })
  lotRef!: string

  @Property({ type: 'text', nullable: true })
  grade?: string | null

  @Property({ type: 'text', nullable: true })
  daylight?: string | null

  @Property({ name: 'target_mm', type: 'numeric', columnType: 'numeric(14,3)' })
  targetMm!: string

  @Property({ name: 'minus_mm', type: 'numeric', columnType: 'numeric(14,3)', nullable: true })
  minusMm?: string | null

  @Property({ name: 'plus_mm', type: 'numeric', columnType: 'numeric(14,3)', nullable: true })
  plusMm?: string | null

  @Property({ type: 'json' })
  readings!: number[]

  @Property({ name: 'out_of_tolerance', type: 'int', default: 0 })
  outOfTolerance: number = 0

  @Property({ type: 'text' })
  result!: 'pass' | 'hold'

  @Property({ type: 'text', nullable: true })
  inspector?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

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
@Entity({ tableName: 'cc_fg_inspections' })
@Index({ name: 'cc_fg_inspections_scope_idx', properties: ['organizationId', 'tenantId', 'reportDate'] })
export class FgInspection {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'inspector' | 'approvedBy' | 'status' | 'postedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'report_date', type: 'text' })
  reportDate!: string

  @Property({ type: 'json' })
  rows!: FgRow[]

  @Property({ type: 'text', nullable: true })
  inspector?: string | null

  @Property({ name: 'approved_by', type: 'text', nullable: true })
  approvedBy?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: 'draft' | 'posted' = 'draft'

  @Property({ name: 'posted_at', type: Date, nullable: true })
  postedAt?: Date | null

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
@Entity({ tableName: 'cc_lab_tests' })
@Index({ name: 'cc_lab_tests_scope_idx', properties: ['organizationId', 'tenantId', 'testDate'] })
export class LabTest {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'lotRefs' | 'productId' | 'itemTitle' | 'customerId' | 'customerName' | 'standard' | 'result' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'test_date', type: 'text' })
  testDate!: string

  @Property({ name: 'lot_refs', type: 'text', nullable: true })
  lotRefs?: string | null

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'item_title', type: 'text', nullable: true })
  itemTitle?: string | null

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ name: 'customer_name', type: 'text', nullable: true })
  customerName?: string | null

  @Property({ name: 'test_type', type: 'text' })
  testType!: string

  @Property({ type: 'text', nullable: true })
  standard?: string | null

  @Property({ type: 'text', default: 'pending' })
  result: 'pass' | 'fail' | 'pending' = 'pending'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

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
@Entity({ tableName: 'cc_fg_direct_ins' })
@Index({ name: 'cc_fg_direct_ins_scope_idx', properties: ['organizationId', 'tenantId', 'inDate'] })
export class FgDirectIn {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'invoiceNo' | 'sheetSize' | 'thicknessMm' | 'nos' | 'lotId' | 'lotNumber' | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'in_date', type: 'text' })
  inDate!: string

  @Property({ type: 'text' })
  supplier!: string

  @Property({ name: 'invoice_no', type: 'text', nullable: true })
  invoiceNo?: string | null

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'item_title', type: 'text' })
  itemTitle!: string

  @Property({ name: 'sheet_size', type: 'text', nullable: true })
  sheetSize?: string | null

  @Property({ name: 'thickness_mm', type: 'numeric', columnType: 'numeric(14,3)', nullable: true })
  thicknessMm?: string | null

  @Property({ type: 'int', nullable: true })
  nos?: number | null

  @Property({ type: 'numeric', columnType: 'numeric(14,3)' })
  kg!: string

  @Property({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId?: string | null

  @Property({ name: 'lot_number', type: 'text', nullable: true })
  lotNumber?: string | null

  @Property({ type: 'text', default: 'posted' })
  status: 'posted' | 'reversed' = 'posted'

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
@Entity({ tableName: 'cc_damage_entries' })
@Index({ name: 'cc_damage_entries_scope_idx', properties: ['organizationId', 'tenantId', 'entryDate'] })
export class DamageEntry {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'lotNumber'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'entry_date', type: 'text' })
  entryDate!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'item_title', type: 'text' })
  itemTitle!: string

  @Property({ name: 'lot_id', type: 'uuid' })
  lotId!: string

  @Property({ name: 'lot_number', type: 'text', nullable: true })
  lotNumber?: string | null

  @Property({ type: 'text' })
  place!: string

  @Property({ type: 'numeric', columnType: 'numeric(14,3)' })
  kg!: string

  @Property({ type: 'text' })
  reason!: string

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

export type PlanLine = { area: 'resin' | 'coating' | 'press' | 'moulding'; resource: string; item: string | null; plannedQty: number; unit: 'kg' | 'nos' | 'sheets'; note: string | null }

@Entity({ tableName: 'cc_production_plans' })
@Index({
  name: 'cc_production_plans_day_unique_idx',
  expression: 'create unique index "cc_production_plans_day_unique_idx" on "cc_production_plans" ("organization_id", "plan_date")',
})
export class ProductionPlan {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'plan_date', type: 'text' })
  planDate!: string

  @Property({ type: 'json' })
  lines!: PlanLine[]

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_sync_clashes' })
@Index({ name: 'cc_sync_clashes_scope_idx', properties: ['organizationId', 'tenantId', 'createdAt'] })
export class SyncClash {
  [OptionalProps]?: 'createdAt' | 'byName' | 'detail'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  screen!: string

  @Property({ name: 'record_ref', type: 'text' })
  recordRef!: string

  @Property({ type: 'text', nullable: true })
  detail?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
