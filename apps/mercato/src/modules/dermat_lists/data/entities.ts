import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { OptionalProps } from '@mikro-orm/core'

@Entity({ tableName: 'dermat_list_options' })
@Index({ name: 'dermat_list_options_scope_idx', properties: ['organizationId', 'tenantId', 'listKey'] })
export class ListOption {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'list_key', type: 'text' })
  listKey!: string

  @Property({ type: 'text' })
  value!: string

  @Property({ type: 'int' })
  position!: number

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
}
