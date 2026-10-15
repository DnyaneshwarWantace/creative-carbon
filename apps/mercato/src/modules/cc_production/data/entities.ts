import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'
import type { RecipeLevel, RecipeLine } from '../lib/recipeCheck'
import type { TcLastColumn, TcLegendEntry, TcObserved, TcRow } from '../lib/tcRules'

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

export type UploadRecordRef = { type: string; id: string; label: string; created: boolean; masterType?: string; undone?: boolean }

@Entity({ tableName: 'cc_upload_batches' })
@Index({ name: 'cc_upload_batches_scope_idx', properties: ['organizationId', 'tenantId', 'registerKey'] })
export class UploadBatch {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'registerDate' | 'errors' | 'records' | 'status' | 'undoneAt' | 'undoneByName' | 'undoReason'

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

  @Property({ type: 'json', nullable: true })
  records?: UploadRecordRef[] | null

  @Property({ type: 'text', default: 'done' })
  status: 'done' | 'undone' = 'done'

  @Property({ name: 'undone_at', type: Date, nullable: true })
  undoneAt?: Date | null

  @Property({ name: 'undone_by_name', type: 'text', nullable: true })
  undoneByName?: string | null

  @Property({ name: 'undo_reason', type: 'text', nullable: true })
  undoReason?: string | null

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
  result!: 'pass' | 'hold' | 'released'

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

export type LabRevision = { revision: number; values: Record<string, unknown>; files: string[]; issuedAt: string | null; amendedAt: string; amendedByName: string | null; reason: string }

@Entity({ tableName: 'cc_lab_tests' })
@Index({ name: 'cc_lab_tests_scope_idx', properties: ['organizationId', 'tenantId', 'testDate'] })
export class LabTest {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'lotRefs' | 'productId' | 'itemTitle' | 'customerId' | 'customerName' | 'standard' | 'result' | 'notes' | 'orderId' | 'orderNo' | 'reportNo' | 'testedBy' | 'testPoint' | 'revision' | 'issuedAt' | 'issuedByName' | 'revisions'

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

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_no', type: 'text', nullable: true })
  orderNo?: string | null

  @Property({ name: 'report_no', type: 'text', nullable: true })
  reportNo?: string | null

  @Property({ name: 'tested_by', type: 'text', nullable: true })
  testedBy?: string | null

  @Property({ name: 'test_point', type: 'text', default: 'outgoing' })
  testPoint: 'incoming' | 'outgoing' = 'outgoing'

  @Property({ type: 'text', nullable: true })
  standard?: string | null

  @Property({ type: 'text', default: 'pending' })
  result: 'pass' | 'fail' | 'pending' = 'pending'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'int', default: 0 })
  revision: number = 0

  @Property({ name: 'issued_at', type: Date, nullable: true })
  issuedAt?: Date | null

  @Property({ name: 'issued_by_name', type: 'text', nullable: true })
  issuedByName?: string | null

  @Property({ type: 'json', nullable: true })
  revisions?: LabRevision[] | null

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
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'vendorId' | 'invoiceNo' | 'sheetSize' | 'thicknessMm' | 'nos' | 'lotId' | 'lotNumber' | 'status'

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

  @Property({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId?: string | null

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
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'byName' | 'lotNumber' | 'status'

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

  @Property({ type: 'text', default: 'posted' })
  status: 'posted' | 'undone' = 'posted'

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

export type PlanVersion = { version: number; lines: PlanLine[]; notes: string | null; byName: string | null; savedAt: string; replacedAt: string; replacedByName: string | null; reason: string | null }

@Entity({ tableName: 'cc_production_plans' })
@Index({
  name: 'cc_production_plans_day_unique_idx',
  expression: 'create unique index "cc_production_plans_day_unique_idx" on "cc_production_plans" ("organization_id", "plan_date")',
})
export class ProductionPlan {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'notes' | 'versions'

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

  @Property({ type: 'json', nullable: true })
  versions?: PlanVersion[] | null

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
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'byName' | 'detail' | 'recordType' | 'recordId' | 'path' | 'offlineVersion' | 'serverVersion' | 'queuedAt' | 'serverByName' | 'status' | 'kept' | 'resolvedAt' | 'resolvedByName' | 'resolveReason'

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

  @Property({ name: 'record_type', type: 'text', nullable: true })
  recordType?: string | null

  @Property({ name: 'record_id', type: 'text', nullable: true })
  recordId?: string | null

  @Property({ type: 'text', nullable: true })
  path?: string | null

  @Property({ name: 'offline_version', type: 'json', nullable: true })
  offlineVersion?: Record<string, unknown> | null

  @Property({ name: 'server_version', type: 'json', nullable: true })
  serverVersion?: Record<string, unknown> | null

  @Property({ name: 'server_by_name', type: 'text', nullable: true })
  serverByName?: string | null

  @Property({ name: 'queued_at', type: Date, nullable: true })
  queuedAt?: Date | null

  @Property({ type: 'text', default: 'open' })
  status: 'open' | 'resolved' = 'open'

  @Property({ type: 'text', nullable: true })
  kept?: 'offline' | 'server' | null

  @Property({ name: 'resolved_at', type: Date, nullable: true })
  resolvedAt?: Date | null

  @Property({ name: 'resolved_by_name', type: 'text', nullable: true })
  resolvedByName?: string | null

  @Property({ name: 'resolve_reason', type: 'text', nullable: true })
  resolveReason?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export const DIE_FAMILIES = ['fibre_bearing', 'fibre_key', 'hanger', 'inside_bearing', 'rod', 'tube', 'plate'] as const
export type DieFamily = (typeof DIE_FAMILIES)[number]

@Entity({ tableName: 'cc_die_chart' })
@Index({ name: 'cc_die_chart_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'cc_die_chart_code_idx', properties: ['organizationId', 'tenantId', 'family', 'code'] })
export class DieChartEntry {

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

  [OptionalProps]?: Common | 'serialNo' | 'note' | 'weightKg' | 'customerRef' | 'chartPage' | 'cutDrawingNo' | 'cavities' | 'quantity' | 'size' | 'r1' | 'r2' | 'r3' | 'r4' | 't' | 'k' | 'l1' | 'l2' | 'w' | 'h1' | 'h2' | 'h3' | 'd' | 'od' | 'idDia' | 'lengthMm'

  @Property({ type: 'text' })
  family!: DieFamily

  @Property({ name: 'serial_no', type: 'text', nullable: true })
  serialNo?: string | null

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'r1', type: 'text', nullable: true })
  r1?: string | null

  @Property({ name: 'r2', type: 'text', nullable: true })
  r2?: string | null

  @Property({ name: 'r3', type: 'text', nullable: true })
  r3?: string | null

  @Property({ name: 'r4', type: 'text', nullable: true })
  r4?: string | null

  @Property({ name: 't', type: 'text', nullable: true })
  t?: string | null

  @Property({ name: 'k', type: 'text', nullable: true })
  k?: string | null

  @Property({ name: 'l1', type: 'text', nullable: true })
  l1?: string | null

  @Property({ name: 'l2', type: 'text', nullable: true })
  l2?: string | null

  @Property({ name: 'w', type: 'text', nullable: true })
  w?: string | null

  @Property({ name: 'h1', type: 'text', nullable: true })
  h1?: string | null

  @Property({ name: 'h2', type: 'text', nullable: true })
  h2?: string | null

  @Property({ name: 'h3', type: 'text', nullable: true })
  h3?: string | null

  @Property({ name: 'd', type: 'text', nullable: true })
  d?: string | null

  @Property({ name: 'od', type: 'text', nullable: true })
  od?: string | null

  @Property({ name: 'id_dia', type: 'text', nullable: true })
  idDia?: string | null

  @Property({ name: 'length_mm', type: 'text', nullable: true })
  lengthMm?: string | null

  @Property({ name: 'weight_kg', type: 'numeric', columnType: 'numeric(8,3)', nullable: true })
  weightKg?: string | null

  @Property({ name: 'customer_ref', type: 'text', nullable: true })
  customerRef?: string | null

  @Property({ name: 'chart_page', type: 'text', nullable: true })
  chartPage?: string | null

  @Property({ name: 'cut_drawing_no', type: 'text', nullable: true })
  cutDrawingNo?: string | null

  @Property({ type: 'text', nullable: true })
  size?: string | null

  @Property({ name: 'cavities', type: 'int', nullable: true })
  cavities?: number | null

  @Property({ name: 'quantity', type: 'int', nullable: true })
  quantity?: number | null
}

export type TcStatus = 'draft' | 'issued'

@Entity({ tableName: 'cc_tc_templates' })
@Index({ name: 'cc_tc_templates_scope_idx', properties: ['organizationId', 'tenantId'] })
export class TcTemplate {

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

  [OptionalProps]?: Common | 'standard' | 'lastColumn' | 'legend'

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'product_label', type: 'text' })
  productLabel!: string

  @Property({ type: 'text' })
  grade!: string

  @Property({ type: 'text', default: 'IS 2036 : 1995' })
  standard: string = 'IS 2036 : 1995'

  @Property({ type: 'json' })
  rows!: TcRow[]

  @Property({ name: 'last_column', type: 'text', default: 'remark' })
  lastColumn: TcLastColumn = 'remark'

  @Property({ type: 'json', nullable: true })
  legend?: TcLegendEntry[] | null
}

@Entity({ tableName: 'cc_test_certificates' })
@Index({ name: 'cc_test_certificates_scope_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'cc_test_certificates_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class TestCertificate {

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

  [OptionalProps]?: Common | 'status' | 'customerId' | 'customerLabel' | 'thicknessMm' | 'traceability' | 'orderId' | 'observed' | 'testedBy' | 'verifiedBy' | 'issuedAt' | 'issuedByName' | 'notOkReason' | 'notes' | 'templateId' | 'lastColumn' | 'legend'

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'cert_date', type: 'text' })
  certDate!: string

  @Property({ type: 'text', default: 'draft' })
  status: TcStatus = 'draft'

  @Property({ name: 'template_id', type: 'uuid', nullable: true })
  templateId?: string | null

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ name: 'customer_label', type: 'text', nullable: true })
  customerLabel?: string | null

  @Property({ name: 'product_label', type: 'text' })
  productLabel!: string

  @Property({ type: 'text' })
  grade!: string

  @Property({ type: 'text' })
  standard!: string

  @Property({ name: 'thickness_mm', type: 'numeric', columnType: 'numeric(6,2)', nullable: true })
  thicknessMm?: string | null

  @Property({ type: 'text', nullable: true })
  traceability?: string | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ type: 'json' })
  rows!: TcRow[]

  @Property({ name: 'last_column', type: 'text', default: 'remark' })
  lastColumn: TcLastColumn = 'remark'

  @Property({ type: 'json', nullable: true })
  legend?: TcLegendEntry[] | null

  @Property({ type: 'json', nullable: true })
  observed?: TcObserved | null

  @Property({ name: 'tested_by', type: 'text', nullable: true })
  testedBy?: string | null

  @Property({ name: 'verified_by', type: 'text', nullable: true })
  verifiedBy?: string | null

  @Property({ name: 'issued_at', type: Date, nullable: true })
  issuedAt?: Date | null

  @Property({ name: 'issued_by_name', type: 'text', nullable: true })
  issuedByName?: string | null

  @Property({ name: 'not_ok_reason', type: 'text', nullable: true })
  notOkReason?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}

@Entity({ tableName: 'cc_rod_stocks' })
@Index({ name: 'cc_rod_stocks_scope_idx', properties: ['organizationId', 'tenantId'] })
export class RodStock {
  [OptionalProps]?: 'srNo' | 'odTo' | 'source' | 'notes' | 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'sr_no', type: 'integer', nullable: true })
  srNo?: number | null

  @Property({ name: 'od_text', type: 'text' })
  odText!: string

  @Property({ name: 'od_from', type: 'numeric', precision: 10, scale: 2 })
  odFrom!: string

  @Property({ name: 'od_to', type: 'numeric', precision: 10, scale: 2, nullable: true })
  odTo?: string | null

  @Property({ name: 'length_mm', type: 'integer' })
  lengthMm!: number

  @Property({ type: 'integer' })
  quantity!: number

  @Property({ type: 'text', nullable: true })
  source?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'cc_recipes' })
@Index({ name: 'cc_recipes_scope_idx', properties: ['organizationId', 'tenantId', 'level'] })
export class Recipe {
  [OptionalProps]?: Common | 'outputProductId' | 'dieNo' | 'notes' | 'lines'

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

  @Property({ type: 'text' })
  level!: RecipeLevel

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'output_product_id', type: 'uuid', nullable: true })
  outputProductId?: string | null

  @Property({ name: 'die_no', type: 'text', nullable: true })
  dieNo?: string | null

  @Property({ name: 'output_qty', type: 'numeric', columnType: 'numeric(14,3)' })
  outputQty!: string

  @Property({ type: 'json' })
  lines: RecipeLine[] = []

  @Property({ type: 'text', nullable: true })
  notes?: string | null
}
