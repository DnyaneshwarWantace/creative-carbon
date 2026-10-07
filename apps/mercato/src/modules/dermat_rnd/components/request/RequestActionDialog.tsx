"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Field } from '../shared/Field'
import { FormDialog } from '../shared/FormDialog'
import { todayIst } from '../labels'
import { useRdSend } from '../useRdApi'
import type { RdRequest, Trial } from '../types'

export type RequestActionKind = 'sample_sent' | 'feedback' | 'drop'

type RequestActionDialogProps = {
  request: RdRequest
  action: RequestActionKind | null
  trials: Trial[]
  onClose: () => void
  onDone: () => void
}

const NO_TRIAL = 'none'

export function RequestActionDialog({ request, action, trials, onClose, onDone }: RequestActionDialogProps) {
  const t = useT()
  const { send, busy } = useRdSend('dermat-rnd-request-action')
  const sendable = trials.filter((trial) => ['testing', 'passed', 'approved'].includes(trial.status))
  const defaultTrial = request.approvedTrialId ?? sendable[sendable.length - 1]?.id ?? NO_TRIAL
  const [sentOn, setSentOn] = React.useState(todayIst())
  const [sentVia, setSentVia] = React.useState('')
  const [trialId, setTrialId] = React.useState<string>(NO_TRIAL)
  const [result, setResult] = React.useState<'approved' | 'changes'>('approved')
  const [text, setText] = React.useState('')

  React.useEffect(() => {
    if (!action) return
    setSentOn(todayIst())
    setSentVia('')
    setTrialId(defaultTrial)
    setResult('approved')
    setText('')
  }, [action, defaultTrial])

  const submit = async () => {
    if (!action) return
    const extra =
      action === 'sample_sent'
        ? { sentOn, sentVia, trialId: trialId === NO_TRIAL ? null : trialId }
        : action === 'feedback'
          ? { result, feedback: text }
          : { note: text }
    const done = await send('/api/dermat_rnd/requests/action', 'POST', { id: request.id, action, ...extra }, { version: request.updatedAt, success: t('dermat_rnd.updated', '{code} updated', { code: request.code }) })
    if (done) onDone()
  }

  const title =
    action === 'sample_sent'
      ? t('dermat_rnd.sentTitle', 'Sample sent for {code}', { code: request.code })
      : action === 'feedback'
        ? t('dermat_rnd.feedbackTitle', 'Client feedback on {code}', { code: request.code })
        : t('dermat_rnd.dropTitle', 'Drop {code}?', { code: request.code })

  return (
    <FormDialog
      open={Boolean(action)}
      title={title}
      description={action === 'feedback' ? t('dermat_rnd.feedbackHint', 'Approved closes the request. Changes send it back to R&D for the next trial.') : undefined}
      submitLabel={action === 'drop' ? t('dermat_rnd.drop', 'Drop') : t('dermat_rnd.confirm', 'Save')}
      destructive={action === 'drop'}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      {action === 'sample_sent' ? (
        <>
          <Field id="rd-sent-trial" label={t('dermat_rnd.sentTrial', 'Sample from trial')}>
            <Select value={trialId} onValueChange={setTrialId}>
              <SelectTrigger id="rd-sent-trial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TRIAL}>{t('dermat_rnd.noTrial', 'Not from a recorded trial')}</SelectItem>
                {sendable.map((trial) => (
                  <SelectItem key={trial.id} value={trial.id}>
                    {trial.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="rd-sent-on" label={t('dermat_rnd.sentOnLabel', 'Sent on')}>
              <Input id="rd-sent-on" type="date" value={sentOn} onChange={(event) => setSentOn(event.target.value)} />
            </Field>
            <Field id="rd-sent-via" label={t('dermat_rnd.via', 'Sent via')}>
              <Input id="rd-sent-via" value={sentVia} placeholder={t('dermat_rnd.viaPlaceholder', 'Courier / hand delivery, docket no.')} onChange={(event) => setSentVia(event.target.value)} />
            </Field>
          </div>
        </>
      ) : null}
      {action === 'feedback' ? (
        <SegmentedControl value={result} onValueChange={(value) => setResult(value as 'approved' | 'changes')} aria-label={t('dermat_rnd.result', 'Result')}>
          <SegmentedControlItem value="approved">{t('dermat_rnd.approvedOpt', 'Client approved')}</SegmentedControlItem>
          <SegmentedControlItem value="changes">{t('dermat_rnd.changesOpt', 'Client wants changes')}</SegmentedControlItem>
        </SegmentedControl>
      ) : null}
      {action === 'feedback' || action === 'drop' ? (
        <Field id="rd-action-text" label={action === 'feedback' ? t('dermat_rnd.whatSaid', 'What the client said') : t('dermat_rnd.why', 'Why *')}>
          <Textarea id="rd-action-text" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
      ) : null}
    </FormDialog>
  )
}
