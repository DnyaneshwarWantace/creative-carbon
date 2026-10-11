import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

export type DepartmentType =
  | 'sales'
  | 'procurement'
  | 'production'
  | 'quality_control'
  | 'finance'
  | 'store'
  | 'admin'

@Entity({ tableName: 'cc_departments' })
@Index({ name: 'cc_departments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'cc_departments_org_tenant_name_uq', properties: ['organizationId', 'tenantId', 'name'] })
export class Department {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ type: 'text' })
  type!: DepartmentType

  @Property({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail?: string | null

  @Property({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone?: string | null

  // References `auth`'s Role by id only — never a MikroORM cross-module relation
  // (see root AGENTS.md "no direct ORM relationships between modules"). Each
  // department owns exactly one backing Role whose `role_acls.features_json`
  // is the department's access set; assigning a user to the department assigns
  // this role via `user_roles`.
  @Property({ name: 'role_id', type: 'uuid', nullable: true })
  roleId?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

export type AccessSubject = 'role' | 'user'
export type AccessState = { exists: boolean; label: string; superAdmin: boolean; features: string[] | null; roles?: string[]; password?: string | null }

@Entity({ tableName: 'cc_access_snapshots' })
@Unique({ name: 'cc_access_snapshots_subject_uq', properties: ['tenantId', 'subjectType', 'subjectId'] })
export class AccessSnapshot {
  [OptionalProps]?: 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'subject_type', type: 'text' })
  subjectType!: AccessSubject

  @Property({ name: 'subject_id', type: 'uuid' })
  subjectId!: string

  @Property({ type: 'json' })
  state!: AccessState

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'cc_access_changes' })
@Index({ name: 'cc_access_changes_subject_idx', properties: ['tenantId', 'subjectType', 'subjectId', 'createdAt'] })
export class AccessChange {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'reason' | 'actorUserId' | 'actorName' | 'undoOf' | 'undoneAt' | 'undoneByName' | 'outside'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'subject_type', type: 'text' })
  subjectType!: AccessSubject

  @Property({ name: 'subject_id', type: 'uuid' })
  subjectId!: string

  @Property({ name: 'subject_label', type: 'text' })
  subjectLabel!: string

  @Property({ type: 'text' })
  action!: string

  @Property({ type: 'json', nullable: true })
  before!: AccessState | null

  @Property({ type: 'json' })
  after!: AccessState

  @Property({ type: 'json' })
  changes!: Array<{ field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null }>

  @Property({ type: 'text', nullable: true })
  reason?: string | null

  @Property({ type: 'boolean', default: false })
  outside: boolean = false

  @Property({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null

  @Property({ name: 'actor_name', type: 'text', nullable: true })
  actorName?: string | null

  @Property({ name: 'undo_of', type: 'uuid', nullable: true })
  undoOf?: string | null

  @Property({ name: 'undone_at', type: Date, nullable: true })
  undoneAt?: Date | null

  @Property({ name: 'undone_by_name', type: 'text', nullable: true })
  undoneByName?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
