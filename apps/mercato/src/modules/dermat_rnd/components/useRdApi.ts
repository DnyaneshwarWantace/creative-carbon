"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { RdRequest, Trial } from './types'

type SendOptions = { version?: string | null; success?: string; resourceKind?: string }

export function useRdSend(contextId: string) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId })
  const [busy, setBusy] = React.useState(false)

  const send = React.useCallback(
    async <T,>(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>, options: SendOptions = {}): Promise<T | null> => {
      setBusy(true)
      try {
        const request = () => apiCall<T & { error?: string }>(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const call = await runMutation({
          context: { resourceKind: options.resourceKind ?? 'dermat_rnd.request', resourceId: String(body.id ?? body.requestId ?? 'new') },
          mutationPayload: body,
          operation: () => (options.version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(options.version), request) : request()),
        })
        if (!call.ok || !call.result) {
          flash(call.result?.error ?? t('dermat_rnd.saveError', 'Could not save. Reload the page and try again.'), 'error')
          return null
        }
        if (options.success) flash(options.success, 'success')
        return call.result
      } finally {
        setBusy(false)
      }
    },
    [runMutation, t],
  )

  return { send, busy }
}

export function useRdRequest(requestId: string) {
  const t = useT()
  const [request, setRequest] = React.useState<RdRequest | null>(null)
  const [trials, setTrials] = React.useState<Trial[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    const [requestCall, trialsCall] = await Promise.all([
      apiCall<RdRequest & { error?: string }>(`/api/dermat_rnd/requests?id=${encodeURIComponent(requestId)}`),
      apiCall<{ items?: Trial[]; error?: string }>(`/api/dermat_rnd/trials?requestId=${encodeURIComponent(requestId)}`),
    ])
    if (!requestCall.ok || !requestCall.result) {
      setError(requestCall.result?.error ?? t('dermat_rnd.loadOneError', 'Could not load this R&D request.'))
      return
    }
    setError(null)
    setRequest(requestCall.result)
    setTrials(trialsCall.result?.items ?? [])
  }, [requestId, t])

  React.useEffect(() => {
    void reload()
  }, [reload])

  return { request, trials, error, reload }
}
