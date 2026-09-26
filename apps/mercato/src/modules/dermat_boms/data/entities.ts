import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type BomStatus = 'draft' | 'approved' | 'superseded'

@Entity({ tableName: 'dermat_bom_headers' })
@Index({ name: 'dermat_bom_headers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dermat_bom_headers_product_idx', properties: ['productId'] })
@Unique({ name: 'dermat_bom_headers_org_code_uq', properties: ['organizationId', 'tenantId', 'code'] })
export class BomHeader {
  [OptionalProps]?: 'version' | 'status' | 'notes' | 'orderId' | 'orderNo' | 'createdByName' | 'approvedByName' | 'approvedAt' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_no', type: 'text', nullable: true })
  orderNo?: string | null

  @Property({ type: 'text' })
  code!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'product_kind', type: 'text' })
  productKind!: string

  @Property({ type: 'int', default: 1 })
  version: number = 1

  @Property({ type: 'text', default: 'draft' })
  status: BomStatus = 'draft'

  @Property({ name: 'batch_size', type: 'numeric', precision: 14, scale: 3 })
  batchSize!: string

  @Property({ name: 'batch_unit', type: 'text' })
  batchUnit!: string

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'approved_by_name', type: 'text', nullable: true })
  approvedByName?: string | null

  @Property({ name: 'approved_at', type: Date, nullable: true })
  approvedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'dermat_bom_items' })
@Index({ name: 'dermat_bom_items_bom_idx', properties: ['bomId'] })
@Index({ name: 'dermat_bom_items_component_idx', properties: ['componentProductId'] })
export class BomItem {
  [OptionalProps]?: 'percent' | 'qtyPerUnit' | 'fillQty' | 'fillUnit' | 'remark' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'bom_id', type: 'uuid' })
  bomId!: string

  @Property({ type: 'int' })
  position!: number

  @Property({ name: 'component_product_id', type: 'uuid' })
  componentProductId!: string

  @Property({ name: 'component_kind', type: 'text' })
  componentKind!: string

  @Property({ type: 'numeric', precision: 9, scale: 4, nullable: true })
  percent?: string | null

  @Property({ name: 'qty_per_unit', type: 'numeric', precision: 14, scale: 5, nullable: true })
  qtyPerUnit?: string | null

  @Property({ name: 'fill_qty', type: 'numeric', precision: 12, scale: 3, nullable: true })
  fillQty?: string | null

  @Property({ name: 'fill_unit', type: 'text', nullable: true })
  fillUnit?: string | null

  @Property({ type: 'text' })
  unit!: string

  @Property({ type: 'text', nullable: true })
  remark?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
