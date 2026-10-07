import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type PoStatus = 'draft' | 'pending_approval' | 'approved' | 'partly_received' | 'received' | 'cancelled'
export type GrnStatus = 'under_test' | 'partly_approved' | 'approved' | 'rejected'
export type LineQc = 'pending' | 'passed' | 'failed' | 'returned'
export type History = { action: string; by: string | null; at: string; note: string | null }

@Entity({ tableName: 'cc_pos' })
@Index({ name: 'cc_pos_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Unique({ name: 'cc_pos_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class PurchaseOrder {
  [OptionalProps]?:
    | 'status'
    | 'vendorGstin'
    | 'expectedDate'
    | 'notes'
    | 'terms'
    | 'orderRefs'
    | 'createdByName'
    | 'approvedByName'
    | 'approvedAt'
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

  @Property({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string

  @Property({ name: 'vendor_name', type: 'text' })
  vendorName!: string

  @Property({ name: 'vendor_gstin', type: 'text', nullable: true })
  vendorGstin?: string | null

  @Property({ name: 'po_date', type: 'text' })
  poDate!: string

  @Property({ name: 'expected_date', type: 'text', nullable: true })
  expectedDate?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: PoStatus = 'draft'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'text', nullable: true })
  terms?: string | null

  @Property({ name: 'order_refs', type: 'json', nullable: true })
  orderRefs?: Array<{ orderId: string; orderNo: string }> | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'approved_by_name', type: 'text', nullable: true })
  approvedByName?: string | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ type: 'json', nullable: true })
  history?: History[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'cc_po_lines' })
@Index({ name: 'cc_po_lines_po_idx', properties: ['poId'] })
@Index({ name: 'cc_po_lines_product_idx', properties: ['organizationId', 'tenantId', 'productId'] })
export class PurchaseOrderLine {
  [OptionalProps]?: 'gstPercent' | 'receivedQty' | 'notes' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'po_id', type: 'uuid' })
  poId!: string

  @Property({ type: 'int' })
  position!: number

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ type: 'text' })
  unit!: string

  @Property({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string

  @Property({ type: 'decimal', precision: 14, scale: 4 })
  rate!: string

  @Property({ name: 'gst_percent', type: 'decimal', precision: 6, scale: 2, default: '18' })
  gstPercent: string = '18'

  @Property({ name: 'received_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  receivedQty: string = '0'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_grns' })
@Index({ name: 'cc_grns_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'cc_grns_po_idx', properties: ['poId'] })
@Unique({ name: 'cc_grns_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class GoodsReceipt {
  [OptionalProps]?: 'status' | 'poId' | 'poCode' | 'invoiceNo' | 'invoiceDate' | 'notes' | 'receivedByName' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'po_id', type: 'uuid', nullable: true })
  poId?: string | null

  @Property({ name: 'po_code', type: 'text', nullable: true })
  poCode?: string | null

  @Property({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string

  @Property({ name: 'vendor_name', type: 'text' })
  vendorName!: string

  @Property({ name: 'grn_date', type: 'text' })
  grnDate!: string

  @Property({ name: 'invoice_no', type: 'text', nullable: true })
  invoiceNo?: string | null

  @Property({ name: 'invoice_date', type: 'text', nullable: true })
  invoiceDate?: string | null

  @Property({ type: 'text', default: 'under_test' })
  status: GrnStatus = 'under_test'

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'received_by_name', type: 'text', nullable: true })
  receivedByName?: string | null

  @Property({ type: 'json', nullable: true })
  history?: History[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'cc_grn_lines' })
@Index({ name: 'cc_grn_lines_grn_idx', properties: ['grnId'] })
@Index({ name: 'cc_grn_lines_check_idx', properties: ['qcCheckId'] })
export class GoodsReceiptLine {
  [OptionalProps]?: 'poLineId' | 'rate' | 'gstPercent' | 'lotId' | 'mfgDate' | 'expiryDate' | 'qcCheckId' | 'qcStatus' | 'returnedQty' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'grn_id', type: 'uuid' })
  grnId!: string

  @Property({ name: 'po_line_id', type: 'uuid', nullable: true })
  poLineId?: string | null

  @Property({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  rate?: string | null

  @Property({ name: 'gst_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  gstPercent?: string | null

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'variant_id', type: 'uuid' })
  variantId!: string

  @Property({ type: 'text' })
  unit!: string

  @Property({ type: 'text' })
  store!: 'rm' | 'pm'

  @Property({ type: 'decimal', precision: 14, scale: 4 })
  quantity!: string

  @Property({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId?: string | null

  @Property({ name: 'lot_number', type: 'text' })
  lotNumber!: string

  @Property({ name: 'mfg_date', type: 'text', nullable: true })
  mfgDate?: string | null

  @Property({ name: 'expiry_date', type: 'text', nullable: true })
  expiryDate?: string | null

  @Property({ name: 'qc_check_id', type: 'uuid', nullable: true })
  qcCheckId?: string | null

  @Property({ name: 'qc_status', type: 'text', default: 'pending' })
  qcStatus: LineQc = 'pending'

  @Property({ name: 'returned_qty', type: 'decimal', precision: 14, scale: 4, default: '0' })
  returnedQty: string = '0'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

export type IndentStatus = 'submitted' | 'approved' | 'rejected' | 'ordered' | 'cancelled'
export type IndentSource = 'department' | 'planning' | 'low_stock'
export type IndentLine = { productId: string; quantity: number; unit: string | null; note: string | null }

@Entity({ tableName: 'cc_purchase_indents' })
@Index({ name: 'cc_purchase_indents_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Unique({ name: 'cc_purchase_indents_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class PurchaseIndent {
  [OptionalProps]?: 'status' | 'source' | 'department' | 'neededBy' | 'notes' | 'orderRefs' | 'requestedByName' | 'approvedByName' | 'approvedAt' | 'decisionNote' | 'poRefs' | 'history' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text', default: 'submitted' })
  status: IndentStatus = 'submitted'

  @Property({ type: 'text', default: 'department' })
  source: IndentSource = 'department'

  @Property({ type: 'text', nullable: true })
  department?: string | null

  @Property({ name: 'needed_by', type: 'text', nullable: true })
  neededBy?: string | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ type: 'json' })
  lines!: IndentLine[]

  @Property({ name: 'order_refs', type: 'json', nullable: true })
  orderRefs?: Array<{ orderId: string; orderNo: string }> | null

  @Property({ name: 'requested_by_name', type: 'text', nullable: true })
  requestedByName?: string | null

  @Property({ name: 'approved_by_name', type: 'text', nullable: true })
  approvedByName?: string | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote?: string | null

  @Property({ name: 'po_refs', type: 'json', nullable: true })
  poRefs?: Array<{ poId: string; code: string }> | null

  @Property({ type: 'json', nullable: true })
  history?: History[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
