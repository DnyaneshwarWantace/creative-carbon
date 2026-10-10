"use client"

import * as React from 'react'
import { AlertTriangle, Download, FileCode2, Hand, History, ListChecks, RotateCw, Send, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { FieldList, HistoryPanel, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, formatDay, formatWhen, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { useGranted } from '../../cc_departments/components/useGranted'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'

export type PushStatus = 'sent' | 'partial' | 'failed' | 'manual'
export type PushDocument = { key: string; type: string; number: string; date: string; reference: string | null; party: string; amount: number; recordId: string | null }
export type PushAttempt = { at: string; by: string | null; status: PushStatus; httpStatus: number | null; created: number; altered: number; errors: number; lineErrors: string[]; error: string | null }
export type PushView = {
  id: string
  code: string
  rangeFrom: string
  rangeTo: string
  kinds: string[]
  withMasters: boolean
  tallyUrl: string
  tallyCompany: string | null
  status: PushStatus
  documents: PushDocument[]
  voucherCount: number
  partyCount: number
  amount: number
  attempts: PushAttempt[]
  lastAttempt: PushAttempt | null
  pushedByName: string | null
  createdAt: string
  updatedAt: string
  requestXml?: string
  responseText?: string | null
}

export const PUSH_STATUS: Record<PushStatus, { label: string; variant: StatusBadgeVariant }> = {
  sent: { label: 'In Tally', variant: 'success' },
  partial: { label: 'Partly in Tally', variant: 'warning' },
  failed: { label: 'Not sent', variant: 'error' },
  manual: { label: 'Entered by hand', variant: 'info' },
}

export const KIND_LABEL: Record<string, string> = { sales: 'Sales', credit_notes: 'Credit notes', receipts: 'Receipts', purchases: 'Purchases', payments: 'Vendor payments' }

function rupees(value: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function documentHref(doc: PushDocument): string | null {
  if (!doc.recordId) return null
  if (doc.type === 'Credit Note' || doc.type === 'Debit Note') return `/backend/accounts/notes/${doc.recordId}`
  if (doc.type === 'Sales') return recordHref.invoice(doc.recordId)
  if (doc.type === 'Receipt') return recordHref.payment(doc.recordId)
  if (doc.type === 'Purchase' || doc.type === 'Payment') return recordHref.vendorBill(doc.recordId)
  return null
}

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function TallyPushPage({ pushId }: { pushId: string }) {
  const t = useT()
  const granted = useGranted()
  const canPush = granted.has('cc_accounts.tally')
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `cc-tally-push-${pushId}` })
  const [push, setPush] = React.useState<PushView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [showXml, setShowXml] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<PushView>(`/api/cc_accounts/tally/pushes?id=${encodeURIComponent(pushId)}`)
    if (!call.ok || !call.result) setError(t('cc_accounts.push.loadError', 'Could not load this Tally push.'))
    else setPush(call.result)
  }, [pushId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error || !push) return <RecordState error={error} loadingLabel={t('cc_accounts.loading', 'Loading…')} />

  const status = PUSH_STATUS[push.status]
  const tookPart = push.attempts.some((attempt) => attempt.created + attempt.altered > 0)
  const canRetry = canPush && push.status !== 'sent' && push.status !== 'manual' && !tookPart
  const canMarkManual = granted.has('cc_accounts.record') && (push.status === 'failed' || push.status === 'partial')
  const last = push.lastAttempt
  const totals = push.attempts.reduce((sum, attempt) => ({ created: Math.max(sum.created, attempt.created), altered: Math.max(sum.altered, attempt.altered) }), { created: 0, altered: 0 })

  const markManual = async (reason: string): Promise<boolean> => {
    const call = await runMutation({
      context: { formId: `cc-tally-push-${push.id}`, resourceKind: 'cc_accounts.tally_push', resourceId: push.id, retryLastMutation },
      mutationPayload: { id: push.id, reason },
      operation: () => apiCall<PushView & { error?: string }>('/api/cc_accounts/tally/pushes/manual', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: push.id, reason }) }),
    })
    if (!call.ok || !call.result || call.result.error) {
      flash(call.result?.error ?? t('cc_accounts.push.manualError', 'Could not mark it.'), 'error')
      return false
    }
    setPush(call.result)
    flash(t('cc_accounts.push.manualOk', 'Marked as entered in Tally by hand'), 'success')
    return true
  }

  const retry = async () => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { formId: `cc-tally-push-${push.id}`, resourceKind: 'cc_accounts.tally_push', resourceId: push.id, retryLastMutation },
        mutationPayload: { id: push.id },
        operation: () => apiCall<PushView & { error?: string }>('/api/cc_accounts/tally/pushes/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: push.id }) }),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.push.retryError', 'Could not send again.'), 'error')
        return
      }
      setPush(call.result)
      flash(call.result.status === 'sent' ? t('cc_accounts.push.retryOk', 'Sent to Tally') : (call.result.lastAttempt?.error ?? t('cc_accounts.push.retryFailed', 'Tally did not take it this time either')), call.result.status === 'sent' ? 'success' : 'error')
    } finally {
      setBusy(false)
    }
  }

  const facts: Fact[] = [
    { label: t('cc_accounts.push.entries', 'Entries'), value: String(push.voucherCount), hint: push.partyCount ? t('cc_accounts.push.ledgers', '+ {count} party ledgers', { count: push.partyCount }) : undefined },
    { label: t('cc_accounts.push.value', 'Value'), value: rupees(push.amount) },
    { label: t('cc_accounts.push.created', 'Created in Tally'), value: String(totals.created), tone: totals.created ? 'good' : undefined },
    { label: t('cc_accounts.push.altered', 'Changed in Tally'), value: String(totals.altered) },
    { label: t('cc_accounts.push.errors', 'Refused'), value: String(last?.errors ?? 0), tone: last?.errors ? 'bad' : undefined },
    { label: t('cc_accounts.push.attempts', 'Attempts'), value: String(push.attempts.length) },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/accounts/tally', label: t('cc_accounts.nav.tally', 'Tally') }}
      overline={t('cc_accounts.push.overline', 'Tally push · {from} to {to}', { from: formatDay(push.rangeFrom), to: formatDay(push.rangeTo) })}
      title={push.code}
      badges={<StatusBadge variant={status.variant} dot>{t(`cc_accounts.push.status.${push.status}`, status.label)}</StatusBadge>}
      meta={t('cc_accounts.push.meta', 'Sent {at} by {by} to {url}', { at: formatWhen(push.createdAt), by: push.pushedByName ?? '—', url: push.tallyUrl })}
      actions={
        <>
          {push.requestXml ? (
            <Button type="button" variant="outline" size="sm" onClick={() => saveFile(`${push.code}.xml`, push.requestXml ?? '', 'application/xml')}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_accounts.push.downloadXml', 'XML sent')}
            </Button>
          ) : null}
          {push.responseText ? (
            <Button type="button" variant="outline" size="sm" onClick={() => saveFile(`${push.code}-reply.xml`, push.responseText ?? '', 'application/xml')}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_accounts.push.downloadReply', 'Tally reply')}
            </Button>
          ) : null}
          {canMarkManual ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setManualOpen(true)}>
              <Hand className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_accounts.push.manual', 'Entered by hand')}
            </Button>
          ) : null}
          {canRetry ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void retry()}>
              <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {busy ? t('cc_accounts.push.sending', 'Sending…') : t('cc_accounts.push.retry', 'Send again')}
            </Button>
          ) : null}
        </>
      }
      alert={
        push.status !== 'sent' && last?.error ? (
          <div className="flex items-start gap-2 rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-sm text-status-error-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{last.error}</p>
              {tookPart ? <p className="mt-0.5 text-xs">{t('cc_accounts.push.partialHint', 'Tally took some entries, so this push cannot be sent again as a whole. Fix the refused entries in Tally, or start a new push from the Tally page and tick only those.')}</p> : null}
            </div>
          </div>
        ) : null
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_accounts.push.documents', 'What was sent')} icon={ListChecks} count={push.documents.length} flush>
              <RegisterGrid
                rows={push.documents}
                rowKey={(doc) => doc.key}
                rowHref={(doc) => documentHref(doc)}
                empty={<PanelEmpty>{t('cc_accounts.push.noDocs', 'No entries.')}</PanelEmpty>}
                columns={[
                  { key: 'date', label: t('cc_accounts.tally.date', 'Date'), render: (doc) => formatDay(doc.date) },
                  { key: 'type', label: t('cc_accounts.tally.type', 'Type'), render: (doc) => doc.type },
                  {
                    key: 'number',
                    label: t('cc_accounts.tally.number', 'No.'),
                    mono: true,
                    render: (doc) => (
                      <span>
                        {doc.number}
                        {doc.reference ? <span className="block text-xs text-muted-foreground">{doc.reference}</span> : null}
                      </span>
                    ),
                  },
                  { key: 'party', label: t('cc_accounts.tally.party', 'Party'), render: (doc) => doc.party },
                  { key: 'amount', label: t('cc_accounts.push.amount', 'Amount'), align: 'right', render: (doc) => rupees(doc.amount), total: rupees(push.amount) },
                ]}
              />
            </Panel>
            {last?.lineErrors.length ? (
              <Panel title={t('cc_accounts.push.lineErrors', 'What Tally refused')} icon={AlertTriangle} count={last.lineErrors.length}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-status-error-text">
                  {last.lineErrors.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <Panel
              title={t('cc_accounts.push.raw', 'XML sent and Tally’s answer')}
              icon={FileCode2}
              action={
                <button type="button" className="text-primary hover:underline" onClick={() => setShowXml((value) => !value)}>
                  {showXml ? t('cc_accounts.push.hide', 'Hide') : t('cc_accounts.push.show', 'Show')}
                </button>
              }
            >
              {showXml ? (
                <div className="space-y-3">
                  <pre className="max-h-80 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">{push.requestXml}</pre>
                  <p className="text-xs font-medium text-muted-foreground">{t('cc_accounts.push.answer', 'Tally answered')}</p>
                  <pre className="max-h-60 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">{push.responseText || t('cc_accounts.push.noAnswer', '(no answer)')}</pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('cc_accounts.push.rawHint', 'The exact file sent and Tally’s reply are kept for checking with the accountant.')}</p>
              )}
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={t('cc_accounts.push.details', 'Push')} icon={Send}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_accounts.push.dates', 'Dates'), `${formatDay(push.rangeFrom)} – ${formatDay(push.rangeTo)}`],
                  [t('cc_accounts.push.kinds', 'Kinds'), push.kinds.map((kind) => t(`cc_accounts.tally.kind.${kind}`, KIND_LABEL[kind] ?? kind)).join(', ')],
                  [t('cc_accounts.push.company', 'Company in Tally'), push.tallyCompany],
                  [t('cc_accounts.push.address', 'Tally address'), <span key="url" className="font-mono text-xs">{push.tallyUrl}</span>],
                  [t('cc_accounts.push.withLedgers', 'Party ledgers'), push.withMasters ? t('cc_accounts.push.included', 'Included') : t('cc_accounts.push.notIncluded', 'Not included')],
                ]}
              />
            </Panel>
            <Panel title={t('cc_accounts.push.linked', 'Linked to')} icon={Waypoints} count={push.documents.length} flush>
              <LinkRows
                empty={t('cc_accounts.push.noDocs', 'No entries.')}
                rows={push.documents.map((doc) => ({
                  key: doc.key,
                  href: documentHref(doc),
                  primary: <span className="font-mono">{doc.number}</span>,
                  secondary: `${doc.type} · ${doc.party}`,
                  value: rupees(doc.amount),
                }))}
              />
            </Panel>
          </>
        }
      />
      <HistoryPanel
        entries={[...push.attempts].reverse().map((attempt, index) => ({
          key: `${attempt.at}-${index}`,
          label: (
            <span className="inline-flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {t(`cc_accounts.push.status.${attempt.status}`, PUSH_STATUS[attempt.status].label)}
            </span>
          ),
          note: [attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : null, t('cc_accounts.push.attemptCounts', '{created} created · {altered} changed · {errors} refused', { created: attempt.created, altered: attempt.altered, errors: attempt.errors }), attempt.error].filter(Boolean).join(' · '),
          by: attempt.by,
          at: attempt.at,
        }))}
      />
      <Attachments type="tally_push" id={push.id} hint={t('cc_accounts.push.filesHint', 'Screenshots from Tally, the accountant’s confirmation, or anything else for this push.')} />
      <Comments type="tally_push" id={push.id} />
      <Timeline type="tally_push" id={push.id} refreshKey={push.updatedAt} />
      <CorrectDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        destructive={false}
        title={t('cc_accounts.push.manualTitle', 'Mark {code} as entered in Tally by hand?', { code: push.code })}
        undo={[t('cc_accounts.push.manualStop', 'It will not be sent again'), t('cc_accounts.push.manualLock', 'Its entries count as in Tally, so they can no longer be corrected here')]}
        confirmLabel={t('cc_accounts.push.manualConfirm', 'Mark as entered')}
        onConfirm={markManual}
      />
    </RecordPage>
  )
}

export default TallyPushPage
