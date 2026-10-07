import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OrderContext } from '../../cc_orders/lib/server'

export async function runListGuarded<T>(ctx: OrderContext, req: Request, listKey: string, payload: Record<string, unknown>, run: () => Promise<T>): Promise<T | Response> {
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'cc_lists.list', resourceId: listKey, operation: 'update', mutationPayload: payload },
  })
  if (!guard.ok) return guard.response
  const result = await run()
  await guard.runAfterSuccess()
  return result
}
