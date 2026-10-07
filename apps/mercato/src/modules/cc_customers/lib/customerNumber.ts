import type { EntityManager } from '@mikro-orm/postgresql'
import { setRecordCustomFields } from '@open-mercato/core/modules/entities/lib/helpers'

const PROFILE_ENTITY = 'customers:customer_company_profile'

type Scope = { tenantId: string; organizationId: string }
type EventBusLike = { emitEvent: (event: string, payload: Record<string, unknown>) => Promise<unknown> }

export async function ensureCustomerNumber(em: EntityManager, scope: Scope, customerEntityId: string): Promise<{ number: string; profileId: string } | null> {
  const connection = em.getConnection()
  const [profile] = await connection.execute<Array<{ id: string }>>(
    'select id from customer_companies where entity_id = ? and tenant_id = ? and organization_id = ? limit 1',
    [customerEntityId, scope.tenantId, scope.organizationId],
  )
  if (!profile) return null
  const [existing] = await connection.execute<Array<{ value_text: string | null }>>(
    `select value_text from custom_field_values where entity_id = ? and record_id = ? and field_key = 'customer_no' and deleted_at is null and coalesce(value_text, '') <> '' limit 1`,
    [PROFILE_ENTITY, profile.id],
  )
  if (existing?.value_text) return { number: existing.value_text, profileId: profile.id }
  const [row] = await connection.execute<Array<{ max: number | null }>>(
    `select max(substring(value_text from 4)::int) as max from custom_field_values
      where entity_id = ? and field_key = 'customer_no' and deleted_at is null and tenant_id = ? and organization_id = ? and value_text ~ '^CTR[0-9]+$'`,
    [PROFILE_ENTITY, scope.tenantId, scope.organizationId],
  )
  const number = `CTR${String(Number(row?.max ?? 0) + 1).padStart(3, '0')}`
  await setRecordCustomFields(em, { entityId: PROFILE_ENTITY, recordId: profile.id, tenantId: scope.tenantId, organizationId: scope.organizationId, values: { customer_no: number } })
  return { number, profileId: profile.id }
}

export async function refreshCustomerIndex(bus: EventBusLike | null, scope: Scope, profileId: string): Promise<void> {
  if (!bus) return
  await bus.emitEvent('query_index.upsert_one', { entityType: PROFILE_ENTITY, recordId: profileId, tenantId: scope.tenantId, organizationId: scope.organizationId })
}
