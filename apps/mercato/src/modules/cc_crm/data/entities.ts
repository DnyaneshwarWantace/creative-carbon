import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type CrmHistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type EnquiryStage = 'new' | 'quoted' | 'negotiating' | 'won' | 'lost'

@Entity({ tableName: 'cc_enquiries' })
@Index({ name: 'cc_enquiries_scope_idx', properties: ['organizationId', 'tenantId', 'stage'] })
export class CcEnquiry {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'stage' | 'customerId' | 'companyName' | 'contactName' | 'phone' | 'email' | 'place' | 'details' | 'ownerName' | 'nextActionOn' | 'nextActionNote' | 'lostReason' | 'orderId' | 'byName'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'enquiry_no', type: 'text' })
  enquiryNo!: string

  @Property({ type: 'text' })
  source!: string

  @Property({ name: 'received_at', type: Date })
  receivedAt!: Date

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ name: 'contact_name', type: 'text', nullable: true })
  contactName?: string | null

  @Property({ type: 'text', nullable: true })
  phone?: string | null

  @Property({ type: 'text', nullable: true })
  email?: string | null

  @Property({ type: 'text', nullable: true })
  place?: string | null

  @Property({ type: 'text' })
  subject!: string

  @Property({ type: 'text', nullable: true })
  details?: string | null

  @Property({ name: 'owner_name', type: 'text', nullable: true })
  ownerName?: string | null

  @Property({ type: 'text', default: 'new' })
  stage: EnquiryStage = 'new'

  @Property({ name: 'next_action_on', type: 'text', nullable: true })
  nextActionOn?: string | null

  @Property({ name: 'next_action_note', type: 'text', nullable: true })
  nextActionNote?: string | null

  @Property({ name: 'lost_reason', type: 'text', nullable: true })
  lostReason?: string | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ type: 'json', default: '[]' })
  history: CrmHistoryEntry[] = []

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'withdrawn'
export type QuotationRevision = { revision: number; at: string; by: string | null; reason: string; quoteDate: string; validUntil: string | null; totalAmount: number; currency: string; status: QuotationStatus; sentAt: string | null; data: Record<string, unknown> }

@Entity({ tableName: 'cc_quotations' })
@Index({ name: 'cc_quotations_scope_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class CcQuotation {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'status' | 'enquiryId' | 'validUntil' | 'currency' | 'totalAmount' | 'orderId' | 'orderNo' | 'byName' | 'sentAt' | 'revision' | 'revisions'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'quote_no', type: 'text' })
  quoteNo!: string

  @Property({ name: 'quote_date', type: 'text' })
  quoteDate!: string

  @Property({ name: 'valid_until', type: 'text', nullable: true })
  validUntil?: string | null

  @Property({ name: 'enquiry_id', type: 'uuid', nullable: true })
  enquiryId?: string | null

  @Property({ name: 'customer_id', type: 'uuid' })
  customerId!: string

  @Property({ type: 'text', default: 'INR' })
  currency: string = 'INR'

  @Property({ name: 'total_amount', type: 'numeric', columnType: 'numeric(16,2)', default: '0' })
  totalAmount: string = '0'

  @Property({ type: 'json' })
  data!: Record<string, unknown>

  @Property({ type: 'text', default: 'draft' })
  status: QuotationStatus = 'draft'

  @Property({ type: 'integer', default: 1 })
  revision: number = 1

  @Property({ type: 'json', nullable: true })
  revisions?: QuotationRevision[] | null

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ name: 'order_no', type: 'text', nullable: true })
  orderNo?: string | null

  @Property({ name: 'by_name', type: 'text', nullable: true })
  byName?: string | null

  @Property({ type: 'json', default: '[]' })
  history: CrmHistoryEntry[] = []

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type FollowUpKind = 'call' | 'visit' | 'sample' | 'quote_chase' | 'other'
export type FollowUpStatus = 'planned' | 'done' | 'skipped'

@Entity({ tableName: 'cc_follow_ups' })
@Index({ name: 'cc_follow_ups_due_idx', properties: ['organizationId', 'tenantId', 'status', 'dueOn'] })
@Index({ name: 'cc_follow_ups_enquiry_idx', properties: ['enquiryId'] })
export class CcFollowUp {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'history' | 'status' | 'kind' | 'enquiryId' | 'quotationId' | 'customerId' | 'ownerName' | 'ownerUserId' | 'note' | 'outcome' | 'doneAt' | 'doneByName' | 'doneByUserId' | 'createdByName' | 'createdByUserId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'enquiry_id', type: 'uuid', nullable: true })
  enquiryId?: string | null

  @Property({ name: 'quotation_id', type: 'uuid', nullable: true })
  quotationId?: string | null

  @Property({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null

  @Property({ type: 'text', default: 'call' })
  kind: FollowUpKind = 'call'

  @Property({ name: 'due_on', type: 'text' })
  dueOn!: string

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'owner_name', type: 'text', nullable: true })
  ownerName?: string | null

  @Property({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId?: string | null

  @Property({ type: 'text', default: 'planned' })
  status: FollowUpStatus = 'planned'

  @Property({ type: 'text', nullable: true })
  outcome?: string | null

  @Property({ name: 'done_at', type: Date, nullable: true })
  doneAt?: Date | null

  @Property({ name: 'done_by_name', type: 'text', nullable: true })
  doneByName?: string | null

  @Property({ name: 'done_by_user_id', type: 'uuid', nullable: true })
  doneByUserId?: string | null

  @Property({ name: 'created_by_name', type: 'text', nullable: true })
  createdByName?: string | null

  @Property({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null

  @Property({ type: 'json', default: '[]' })
  history: CrmHistoryEntry[] = []

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
