import { PartyLogo, type PartyKind } from '../data/entities'
import type { OrderContext } from '../../cc_orders/lib/server'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

export const MAX_LOGO_CHARS = 700_000
export const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

export async function findPartyLogo(scope: Scope, kind: PartyKind, partyId: string): Promise<PartyLogo | null> {
  return scope.em.findOne(PartyLogo, { tenantId: scope.tenantId, organizationId: scope.organizationId, partyKind: kind, partyId })
}

export async function savePartyLogo(scope: Scope, kind: PartyKind, partyId: string, imageUrl: string, byName: string | null): Promise<PartyLogo> {
  const existing = await findPartyLogo(scope, kind, partyId)
  const row = existing ?? scope.em.create(PartyLogo, { tenantId: scope.tenantId, organizationId: scope.organizationId, partyKind: kind, partyId, imageUrl })
  row.imageUrl = imageUrl
  row.updatedByName = byName
  row.updatedAt = new Date()
  scope.em.persist(row)
  await scope.em.flush()
  return row
}

export async function removePartyLogo(scope: Scope, kind: PartyKind, partyId: string): Promise<boolean> {
  const existing = await findPartyLogo(scope, kind, partyId)
  if (!existing) return false
  scope.em.remove(existing)
  await scope.em.flush()
  return true
}
