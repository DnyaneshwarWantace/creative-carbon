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
