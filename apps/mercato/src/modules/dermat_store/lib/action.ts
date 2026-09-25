import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { StoreRequest } from '../data/entities'
import { findRequest, requestView } from './service'
import { resolveStoreContext, runGuarded, storeErrorResponse, type StoreContext } from './server'

export function storeAction<T extends { id: string }>(schema: ZodType<T>, invalid: string, run: (ctx: StoreContext, request: StoreRequest, input: T) => Promise<void>) {
  return async function POST(req: Request) {
    const ctx = await resolveStoreContext(req)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: invalid }, { status: 400 })
    try {
      const request = await findRequest(ctx, parsed.data.id)
      enforceCommandOptimisticLock({ resourceKind: 'dermat_store.request', resourceId: request.id, current: request.updatedAt, request: req })
      return await runGuarded(ctx, req, { resourceId: request.id, operation: 'custom', payload: parsed.data as Record<string, unknown> }, async () => {
        await run(ctx, request, parsed.data)
        return NextResponse.json(await requestView(ctx, await findRequest({ ...ctx, em: ctx.em.fork() }, request.id), true))
      })
    } catch (error) {
      return storeErrorResponse(error)
    }
  }
}
