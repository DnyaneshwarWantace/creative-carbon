"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { StageActionRequest } from './StageSheet'
import type { Order, Stage } from './types'

export function useStageAction(contextId: string) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId })
  const [busy, setBusy] = React.useState(false)

  const run = React.useCallback(
    async (order: Order, stage: Stage, request: StageActionRequest): Promise<{ order: Order | null; conflict: boolean }> => {
      setBusy(true)
      try {
        const body = { orderId: order.id, stageKey: stage.key, ...request }
        const call = await runMutation({
          context: { orderId: order.id, stageKey: stage.key, action: request.action },
          mutationPayload: body,
          operation: () =>
            withScopedApiRequestHeaders(buildOptimisticLockHeader(order.updatedAt), () =>
              apiCall<Order & { error?: string }>('/api/cc_orders/orders/stage', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              }),
            ),
        })
        if (!call.ok || !call.result) {
          flash(
            call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
              ? t('cc_orders.errors.conflict', 'Someone else changed this order. Reload to see the latest.')
              : (call.result?.error ?? t('cc_orders.errors.stage', 'Could not update the stage.')),
            'error',
          )
          return { order: null, conflict: call.status === 409 }
        }
        const next = call.result
        if (request.action === 'complete' || request.action === 'skip') {
          const opened = next.stages.filter((entry) => entry.status === 'open' && order.stages.find((before) => before.key === entry.key)?.status === 'waiting')
          flash(
            opened.length
              ? t('cc_orders.flash.movedTo', '{stage} done — moved to {next}', { stage: stage.label, next: opened.map((entry) => `${entry.label} (${entry.department})`).join(' and ') })
              : t('cc_orders.flash.done', '{stage} done', { stage: stage.label }),
            'success',
          )
        } else if (request.action !== 'step') {
          const messages: Record<string, string> = {
            save: t('cc_orders.flash.stageSaved', 'Saved'),
            hold: t('cc_orders.flash.held', '{stage} on hold', { stage: stage.label }),
            resume: t('cc_orders.flash.resumed', '{stage} resumed', { stage: stage.label }),
            revert: t('cc_orders.flash.reopened', '{stage} reopened', { stage: stage.label }),
            assign: t('cc_orders.flash.assigned', 'Responsible person updated'),
            pm_status: t('cc_orders.flash.pmStatus', 'Packing item status updated'),
            new_round: t('cc_orders.flash.newRound', 'New sample round started'),
          }
          flash(messages[request.action] ?? '', 'success')
        }
        return { order: next, conflict: false }
      } catch {
        flash(t('cc_orders.errors.stage', 'Could not update the stage.'), 'error')
        return { order: null, conflict: false }
      } finally {
        setBusy(false)
      }
    },
    [runMutation, t],
  )

  return { busy, run }
}
