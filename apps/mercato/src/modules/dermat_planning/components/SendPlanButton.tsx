"use client"

import * as React from 'react'
import Link from 'next/link'
import { Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { STORE_STATUS } from './StorePlansPage'
import type { SavedPlan } from './shared'

type StorePlan = SavedPlan & { storeStatus?: 'sent' | 'preparing' | 'ready' | null; prepareBy?: string | null; storeByName?: string | null }

export function SendPlanButton({ plan, onSent }: { plan: StorePlan; onSent: () => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-plan-send-${plan.id}` })
  const [open, setOpen] = React.useState(false)
  const [prepareBy, setPrepareBy] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const status = plan.storeStatus ? STORE_STATUS[plan.storeStatus] : null

  const send = async () => {
    const body = { id: plan.id, prepareBy: prepareBy || null, note: note.trim() || null }
    setBusy(true)
    try {
      const request = () => apiCall<{ error?: string }>('/api/dermat_planning/plans/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'dermat_planning.plan', resourceId: plan.id }, mutationPayload: body, operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(plan.updatedAt), request) })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_planning.send.error', 'Could not send the plan.'), 'error')
        return
      }
      flash(t('dermat_planning.send.done', '{code} sent. The store has been told.', { code: plan.code }), 'success')
      setOpen(false)
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {status ? (
        <Link href={`/backend/store/plans?id=${plan.id}`} title={plan.storeByName ?? undefined}>
          <StatusBadge variant={status.variant}>{status.label}{plan.prepareBy ? ` · ${plan.prepareBy}` : ''}</StatusBadge>
        </Link>
      ) : null}
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {status ? t('dermat_planning.send.again', 'Send again') : t('dermat_planning.send.button', 'Send to store')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('dermat_planning.send.title', 'Send {code} to the store', { code: plan.code })}</DialogTitle>
            <DialogDescription>{t('dermat_planning.send.description', 'The store gets a pick list of every material in this plan, with the batches to take. Save the plan first if you changed it.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-prepare-by">{t('dermat_planning.send.prepareBy', 'Have it ready by')}</Label>
              <Input id="plan-prepare-by" type="date" value={prepareBy} onChange={(event) => setPrepareBy(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-note">{t('dermat_planning.send.note', 'Note for the store (optional)')}</Label>
              <Textarea id="plan-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="button" onClick={() => void send()} disabled={busy}>
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {busy ? t('dermat_planning.send.sending', 'Sending…') : t('dermat_planning.send.confirm', 'Send to store')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
