import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type ActivityKind = 'change' | 'stage' | 'document' | 'correction' | 'comment' | 'attachment' | 'system'
export type ActivitySource = 'screen' | 'upload' | 'phone' | 'job' | 'api'
export type ActivityChange = { field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null; money?: boolean }
export type ActivityLink = { type: string; id: string; label: string | null }

@Entity({ tableName: 'cc_activity_log' })
@Index({ name: 'cc_activity_log_record_idx', properties: ['organizationId', 'tenantId', 'recordType', 'recordId', 'createdAt'] })
@Index({ name: 'cc_activity_log_actor_idx', properties: ['organizationId', 'tenantId', 'actorUserId', 'createdAt'] })
export class ActivityEntry {
  [OptionalProps]?: 'createdAt' | 'reason' | 'changes' | 'links' | 'actorUserId' | 'actorName' | 'summary' | 'source' | 'kind'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'record_type', type: 'text' })
  recordType!: string

  @Property({ name: 'record_id', type: 'text' })
  recordId!: string

  @Property({ type: 'text' })
  action!: string

  @Property({ type: 'text', default: 'change' })
  kind: ActivityKind = 'change'

  @Property({ type: 'text', nullable: true })
  summary?: string | null

  @Property({ type: 'text', nullable: true })
  reason?: string | null

  @Property({ type: 'json', nullable: true })
  changes?: ActivityChange[] | null

  @Property({ type: 'json', nullable: true })
  links?: ActivityLink[] | null

  @Property({ type: 'text', default: 'screen' })
  source: ActivitySource = 'screen'

  @Property({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null

  @Property({ name: 'actor_name', type: 'text', nullable: true })
  actorName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

export type SettingsArea = 'list' | 'series' | 'company' | 'tally' | 'stage'

@Entity({ tableName: 'cc_settings_changes' })
@Index({ name: 'cc_settings_changes_scope_idx', properties: ['organizationId', 'tenantId', 'createdAt'] })
export class SettingsChange {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'meta' | 'actorUserId' | 'actorName' | 'status' | 'undoneAt' | 'undoneByName' | 'undoReason'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  area!: SettingsArea

  @Property({ name: 'setting_key', type: 'text' })
  settingKey!: string

  @Property({ type: 'text' })
  label!: string

  @Property({ type: 'json', nullable: true })
  before!: Record<string, unknown> | null

  @Property({ type: 'json', nullable: true })
  after!: Record<string, unknown> | null

  @Property({ type: 'json' })
  changes!: ActivityChange[]

  @Property({ type: 'json', nullable: true })
  meta?: Record<string, unknown> | null

  @Property({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null

  @Property({ name: 'actor_name', type: 'text', nullable: true })
  actorName?: string | null

  @Property({ type: 'text', default: 'live' })
  status: 'live' | 'undone' = 'live'

  @Property({ name: 'undone_at', type: Date, nullable: true })
  undoneAt?: Date | null

  @Property({ name: 'undone_by_name', type: 'text', nullable: true })
  undoneByName?: string | null

  @Property({ name: 'undo_reason', type: 'text', nullable: true })
  undoReason?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
