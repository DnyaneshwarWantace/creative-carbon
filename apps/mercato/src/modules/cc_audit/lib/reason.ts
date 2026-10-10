import type { RefinementCtx } from 'zod'

export const REASON_MESSAGE = 'Write why (at least 3 letters); it is kept in the history'

export function requireReasonFor<T extends object>(actions: readonly string[], field: string = 'reason') {
  return (value: T, ctx: RefinementCtx) => {
    const action = (value as Record<string, unknown>).action
    if (actions.length && !(typeof action === 'string' && actions.includes(action))) return
    const text = (value as Record<string, unknown>)[field]
    if (typeof text !== 'string' || text.trim().length < 3) ctx.addIssue({ code: 'custom', path: [field], message: REASON_MESSAGE })
  }
}

export function reasonIssue(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string | null {
  return error.issues.find((issue) => issue.path[0] === 'reason' || issue.path[0] === 'note')?.message ?? null
}
