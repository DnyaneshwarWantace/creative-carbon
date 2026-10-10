"use client"

import * as React from 'react'
import { Ban, FileMinus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, formatDay, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'
import { InvoicePage } from './InvoicePage'
import { PrintButton, rupees } from './AccountRecords'

type DebitNoteView = { id: string; code: string; vendorBillId: string; billCode: string; vendorId: string; vendorName: string; noteDate: string; reason: string; taxable: number; gst: number; total: number; status: 'issued' | 'cancelled'; cancelReason: string | null; history: unknown[]; createdByName: string | null; updatedAt: string }
type NoteLookup = { kind: 'credit' | 'debit'; id: string; note?: DebitNoteView; error?: string }

export function NotePage({ id }: { id: string }) {
  const t = useT()
  const [lookup, setLookup] = React.useState<NoteLookup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const call = await apiCall<NoteLookup>(`/api/cc_accounts/notes?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(call.status === 404 ? t('cc_accounts.notes.notFound', 'This note does not exist.') : t('cc_accounts.notes.loadError', 'Could not load the note.'))
    else setLookup(call.result)
  }, [id, t])
  React.useEffect(() => {
    void load()
  }, [load])
  if (!lookup) return <RecordState error={error} loadingLabel={t('cc_accounts.loading', 'Loading…')} />
  if (lookup.kind === 'credit') return <InvoicePage id={lookup.id} />
  return lookup.note ? <DebitNotePage note={lookup.note} onChanged={(next) => setLookup({ ...lookup, note: next })} /> : null
}

function DebitNotePage({ note, onChanged }: { note: DebitNoteView; onChanged: (next: DebitNoteView) => void }) {
  const t = useT()
  const granted = useGranted()
  const canRecord = !granted.ready || granted.has('cc_accounts.record')
  const { runMutation } = useGuardedMutation({ contextId: `cc-note-${note.id}` })
  const [cancelling, setCancelling] = React.useState(false)

  const cancel = async (reason: string): Promise<boolean> => {
    const body = { id: note.id, action: 'cancel', reason }
    const call = await runMutation({
      context: { noteId: note.id, action: 'cancel' },
      mutationPayload: body,
      operation: () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(note.updatedAt), () =>
          apiCall<{ note?: DebitNoteView; error?: string }>('/api/cc_accounts/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ),
    })
    if (!call.ok || !call.result?.note) {
      flash(call.result?.error ?? t('cc_accounts.notes.cancelError', 'Could not cancel the note.'), 'error')
      return false
    }
    onChanged(call.result.note)
    flash(t('cc_accounts.notes.cancelledFlash', 'Debit note cancelled; the bill balance is back'), 'success')
    return true
  }

  const facts: Fact[] = [
    { label: t('cc_accounts.notes.date', 'Note date'), value: formatDay(note.noteDate) },
    { label: t('cc_accounts.notes.against', 'Against bill'), value: note.billCode },
    { label: t('cc_accounts.bills.taxable', 'Taxable'), value: rupees(note.taxable) },
    { label: 'GST', value: rupees(note.gst) },
    { label: t('cc_accounts.bills.total', 'Total'), value: rupees(note.total), tone: note.status === 'cancelled' ? undefined : 'good' },
    { label: t('cc_accounts.notes.status', 'Status'), value: note.status === 'cancelled' ? t('cc_accounts.notes.cancelled', 'Cancelled') : t('cc_accounts.notes.issued', 'Issued') },
  ]

  return (
    <RecordPage
      back={{ href: recordHref.vendorBill(note.vendorBillId), label: t('cc_accounts.notes.backToBill', 'Bill {code}', { code: note.billCode }) }}
      overline={[t('cc_accounts.notes.debitOverline', 'Debit note'), note.vendorName].join(' · ')}
      title={note.code}
      badges={<StatusBadge variant={note.status === 'cancelled' ? 'neutral' : 'success'} dot>{note.status === 'cancelled' ? t('cc_accounts.notes.cancelled', 'Cancelled') : t('cc_accounts.notes.issued', 'Issued')}</StatusBadge>}
      meta={note.createdByName ? t('cc_accounts.notes.madeBy', 'Made by {name}', { name: note.createdByName }) : undefined}
      actions={
        <>
          <PrintButton />
          {canRecord && note.status === 'issued' ? (
            <Button type="button" variant="destructive-ghost" size="sm" onClick={() => setCancelling(true)}>
              <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_accounts.notes.cancel', 'Cancel')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_accounts.notes.why', 'Why')} icon={FileMinus}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_accounts.notes.reason', 'Reason'), note.reason],
                ...(note.cancelReason ? ([[t('cc_accounts.notes.cancelReason', 'Cancelled because'), note.cancelReason]] as Array<[string, React.ReactNode]>) : []),
              ]}
            />
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_accounts.notes.cameFrom', 'Came from')} flush>
              <LinkRows
                empty=""
                rows={[
                  { key: 'bill', href: recordHref.vendorBill(note.vendorBillId), primary: <span className="font-mono">{note.billCode}</span>, secondary: t('cc_accounts.bills.overline', 'Vendor bill') },
                  { key: 'vendor', href: recordHref.vendor(note.vendorId), primary: note.vendorName, secondary: t('cc_accounts.bills.vendor', 'Vendor') },
                ]}
              />
            </Panel>
            <Panel title={t('cc_accounts.notes.wentTo', 'Went to')} flush>
              <LinkRows empty="" rows={[{ key: 'dues', href: recordHref.vendorBill(note.vendorBillId), primary: t('cc_accounts.notes.dues', 'Bill balance'), secondary: t('cc_accounts.notes.duesHint', 'Reduced by this note') }, { key: 'tally', href: '/backend/accounts/tally', primary: t('cc_accounts.notes.tally', 'Tally push'), secondary: t('cc_accounts.notes.tallyHint', 'Goes with the purchases') }]} />
            </Panel>
          </>
        }
      />
      <Attachments type="debit_note" id={note.id} hint={t('cc_accounts.notes.filesHint', 'The note PDF sent to the vendor.')} />
      <Comments type="debit_note" id={note.id} />
      <Timeline type="debit_note" id={note.id} refreshKey={note.updatedAt} />
      <CorrectDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('cc_accounts.notes.cancelTitle', 'Cancel debit note {code}?', { code: note.code })}
        undo={[t('cc_accounts.notes.cancelUndo', '{amount} is back as still to pay on bill {bill}', { amount: rupees(note.total), bill: note.billCode })]}
        confirmLabel={t('cc_accounts.notes.cancelConfirm', 'Cancel the note')}
        onConfirm={cancel}
      />
    </RecordPage>
  )
}

export default NotePage
