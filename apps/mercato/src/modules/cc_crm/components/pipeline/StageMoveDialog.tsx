"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { TONE_DOT, type Answers, type PipelineStage } from './stageUi'

export type MoveTarget = {
  enquiry: { id: string; enquiryNo: string; partyName: string | null; subject: string; updatedAt: string; quote?: { no: string; status: string } | null }
  from: PipelineStage | null
  to: PipelineStage
}

export function StageMoveDialog({ target, onCancel, onConfirm }: { target: MoveTarget | null; onCancel: () => void; onConfirm: (answers: Answers) => Promise<boolean> }) {
  const t = useT()
  const [answers, setAnswers] = React.useState<Answers>({})
  const [busy, setBusy] = React.useState(false)
  const [tried, setTried] = React.useState(false)

  React.useEffect(() => {
    setAnswers({})
    setTried(false)
  }, [target])

  if (!target) return null
  const { to, from, enquiry } = target
  const missing = to.questions.filter((question) => question.required && (answers[question.key] === undefined || answers[question.key] === null || answers[question.key] === ''))
  const set = (key: string, value: Answers[string]) => setAnswers((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setTried(true)
    if (missing.length || busy) return
    setBusy(true)
    try {
      await onConfirm(answers)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {from ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', TONE_DOT[from.tone] ?? TONE_DOT.neutral)} />
                {from.label}
              </span>
            ) : null}
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[to.tone] ?? TONE_DOT.neutral)} />
              {to.label}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{enquiry.enquiryNo}</span> · {enquiry.partyName ?? '—'} · {enquiry.subject}
          </DialogDescription>
        </DialogHeader>
        {to.description ? <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{to.description}</p> : null}
        {to.kind === 'won' && enquiry.quote ? (
          <p className="rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
            {t('cc_crm.pipeline.wonHint', 'Quotation {no} is {status}. Converting it books the order and marks this enquiry won by itself.', { no: enquiry.quote.no, status: enquiry.quote.status })}{' '}
            <Link className="font-semibold underline" href={`/backend/crm/enquiries/${enquiry.id}`}>
              {t('cc_crm.pipeline.openEnquiry', 'Open the enquiry')}
            </Link>
          </p>
        ) : null}
        <div className="space-y-3">
          {to.questions.map((question) => {
            const value = answers[question.key]
            const error = tried && question.required && (value === undefined || value === null || value === '')
            const id = `stage-q-${question.key}`
            return (
              <div key={question.key} className="space-y-1">
                <Label htmlFor={id}>
                  {question.label}
                  {question.required ? <span className="text-status-error-icon"> *</span> : null}
                </Label>
                {question.type === 'textarea' ? (
                  <Textarea id={id} rows={3} value={String(value ?? '')} onChange={(event) => set(question.key, event.target.value)} />
                ) : question.type === 'select' ? (
                  <Dropdown id={id} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={String(value ?? '')} onChange={(event) => set(question.key, event.target.value || null)} placeholder={t('cc_crm.pipeline.pick', 'Pick one')}>
                    <option value="">{t('cc_crm.pipeline.pick', 'Pick one')}</option>
                    {(question.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Dropdown>
                ) : question.type === 'yesno' ? (
                  <div className="flex gap-2" role="radiogroup" aria-labelledby={id}>
                    {[true, false].map((choice) => (
                      <Button key={String(choice)} type="button" size="sm" variant={value === choice ? 'default' : 'outline'} onClick={() => set(question.key, choice)}>
                        {choice ? t('cc_crm.pipeline.yes', 'Yes') : t('cc_crm.pipeline.no', 'No')}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input
                    id={id}
                    type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text'}
                    inputMode={question.type === 'number' ? 'decimal' : undefined}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(event) => set(question.key, question.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
                  />
                )}
                {question.hint ? <p className="text-xs text-muted-foreground">{question.hint}</p> : null}
                {error ? <p className="text-xs text-status-error-text">{t('cc_crm.pipeline.required', 'Needed to move the enquiry here')}</p> : null}
              </div>
            )
          })}
          {!to.questions.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              {t('cc_crm.pipeline.noQuestions', 'No questions for this stage.')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? t('cc_crm.pipeline.moving', 'Moving…') : t('cc_crm.pipeline.move', 'Move to {stage}', { stage: to.label })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
