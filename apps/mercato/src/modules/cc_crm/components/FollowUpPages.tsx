"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, PhoneCall, SkipForward, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, formatDay, type Fact } from '../../cc_ui/components/RecordPage'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { CorrectDialog, MIN_REASON } from '../../cc_ui/components/CorrectDialog'

type Kind = 'call' | 'visit' | 'sample' | 'quote_chase' | 'other'
type Status = 'planned' | 'done' | 'skipped'
type Row = { id: string; kind: Kind; kindLabel: string; dueOn: string; overdue: boolean; status: Status; note: string | null; outcome: string | null; ownerName: string | null; enquiryId: string | null; enquiryNo: string | null; subject: string | null; partyName: string | null }
type Detail = {
  id: string
  kind: Kind
  kindLabel: string
  dueOn: string
  overdue: boolean
  note: string | null
  ownerName: string | null
  status: Status
  outcome: string | null
  doneAt: string | null
  doneByName: string | null
  canUndo: boolean
  createdByName: string | null
  enquiry: { id: string; enquiryNo: string; subject: string; stage: string } | null
  quotation: { id: string; quoteNo: string; status: string } | null
  customer: { id: string; name: string | null } | null
  partyName: string | null
  others: Array<{ id: string; kind: Kind; dueOn: string; status: Status; newer: boolean }>
  updatedAt: string
  nextId?: string | null
}

const KINDS: Kind[] = ['call', 'visit', 'sample', 'quote_chase', 'other']
const KIND_LABEL: Record<Kind, string> = { call: 'Call', visit: 'Visit', sample: 'Sample', quote_chase: 'Quote chase', other: 'Other' }
const STATUS: Record<Status, { label: string; variant: StatusBadgeVariant }> = {
  planned: { label: 'Planned', variant: 'info' },
  done: { label: 'Done', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'neutral' },
}

function today(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function FollowUpsPage() {
  const t = useT()
  const [view, setView] = React.useState<'mine' | 'all'>('mine')
  const [status, setStatus] = React.useState<'open' | 'done' | 'all'>('open')
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRows(null)
    void apiCall<{ items: Row[] }>(`/api/cc_crm/follow-ups?view=${view}&status=${status}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_crm.followUps.loadError', 'Could not load the follow-ups.'))
      else {
        setError(null)
        setRows(call.result.items)
      }
    })
  }, [view, status, t])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <header className="space-y-1 border-b pb-3">
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_crm.followUps.title', 'Follow-ups')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_crm.followUps.lede', 'Calls, visits, samples and quote chases planned on enquiries and quotations. Overdue ones are on top.')}</p>
          </header>
          <div className="flex flex-wrap gap-2">
            <SegmentedControl value={view} onValueChange={(value) => setView(value as 'mine' | 'all')} aria-label={t('cc_crm.followUps.whose', 'Whose')}>
              <SegmentedControlItem value="mine">{t('cc_crm.followUps.mine', 'Mine')}</SegmentedControlItem>
              <SegmentedControlItem value="all">{t('cc_crm.followUps.all', 'Everyone')}</SegmentedControlItem>
            </SegmentedControl>
            <SegmentedControl value={status} onValueChange={(value) => setStatus(value as 'open' | 'done' | 'all')} aria-label={t('cc_crm.followUps.status', 'Status')}>
              <SegmentedControlItem value="open">{t('cc_crm.followUps.open', 'To do')}</SegmentedControlItem>
              <SegmentedControlItem value="done">{t('cc_crm.followUps.done', 'Done')}</SegmentedControlItem>
              <SegmentedControlItem value="all">{t('cc_crm.followUps.any', 'All')}</SegmentedControlItem>
            </SegmentedControl>
          </div>
          {error ? <ErrorMessage label={error} /> : null}
          {!rows && !error ? <PageLoading label={t('cc_crm.followUps.loading', 'Loading follow-ups…')} /> : null}
          {rows ? (
            rows.length ? (
              <ul className="divide-y rounded-lg border bg-card">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link href={`/backend/crm/follow-ups/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {t(`cc_crm.followUps.kind.${row.kind}`, row.kindLabel)}
                          {row.partyName ? <span className="truncate">· {row.partyName}</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{[row.enquiryNo, row.subject, row.status === 'planned' ? row.note : row.outcome, row.ownerName].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn('font-mono text-xs tabular-nums', row.overdue && 'font-semibold text-status-error-text')}>{formatDay(row.dueOn)}</span>
                        <StatusBadge variant={row.overdue ? 'error' : STATUS[row.status].variant}>{row.overdue ? t('cc_crm.followUps.overdue', 'Overdue') : t(`cc_crm.followUps.status.${row.status}`, STATUS[row.status].label)}</StatusBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border bg-card px-3 py-8 text-center text-sm text-muted-foreground">{t('cc_crm.followUps.empty', 'Nothing here.')}</p>
            )
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export function FollowUpPage({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canManage = granted.has('cc_crm.manage')
  const { runMutation } = useGuardedMutation({ contextId: `cc-follow-up-${id}` })
  const [row, setRow] = React.useState<Detail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'done' | 'reschedule' | null>(null)
  const [closing, setClosing] = React.useState<'skip' | 'undo' | null>(null)
  const [form, setForm] = React.useState({ outcome: '', nextOn: '', nextKind: 'call' as Kind, nextNote: '', dueOn: '', reason: '' })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Detail>(`/api/cc_crm/follow-ups?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(t('cc_crm.followUps.loadOneError', 'Could not load this follow-up.'))
    else setRow(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!row) return <RecordState error={error} loadingLabel={t('cc_crm.followUps.loadingOne', 'Loading follow-up…')} />

  const act = async (body: Record<string, unknown>, success: string): Promise<boolean> => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { followUpId: row.id, action: body.action },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
            apiCall<Detail & { error?: string }>('/api/cc_crm/follow-ups/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id, ...body }) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_crm.followUps.actError', 'Could not save.'), 'error')
        if (call.status === 409) await load()
        return false
      }
      setRow(call.result)
      flash(success, 'success')
      if (call.result.nextId) router.push(`/backend/crm/follow-ups/${call.result.nextId}`)
      return true
    } finally {
      setBusy(false)
    }
  }

  const open = (next: 'done' | 'reschedule') => {
    setForm({ outcome: '', nextOn: '', nextKind: row.kind, nextNote: '', dueOn: row.dueOn, reason: '' })
    setMode(next)
  }

  const submit = async () => {
    if (mode === 'done') {
      if (form.outcome.trim().length < MIN_REASON) return
      const ok = await act({ action: 'done', outcome: form.outcome.trim(), next: form.nextOn ? { dueOn: form.nextOn, kind: form.nextKind, note: form.nextNote.trim() || null } : null }, t('cc_crm.followUps.doneFlash', 'Marked done'))
      if (ok) setMode(null)
    } else if (mode === 'reschedule') {
      if (form.reason.trim().length < MIN_REASON || !form.dueOn) return
      const ok = await act({ action: 'reschedule', dueOn: form.dueOn, reason: form.reason.trim() }, t('cc_crm.followUps.moved', 'Moved; the old date is kept in the history'))
      if (ok) setMode(null)
    }
  }

  const facts: Fact[] = [
    { label: t('cc_crm.followUps.due', 'Due'), value: formatDay(row.dueOn), tone: row.overdue ? 'bad' : undefined },
    { label: t('cc_crm.followUps.type', 'Type'), value: t(`cc_crm.followUps.kind.${row.kind}`, row.kindLabel) },
    { label: t('cc_crm.followUps.party', 'Customer'), value: row.partyName ?? '—' },
    { label: t('cc_crm.followUps.enquiry', 'Enquiry'), value: row.enquiry?.enquiryNo ?? row.quotation?.quoteNo ?? '—' },
    { label: t('cc_crm.followUps.owner', 'Owner'), value: row.ownerName ?? '—' },
    { label: t('cc_crm.followUps.outcome', 'Outcome'), value: row.outcome ?? (row.status === 'skipped' ? t('cc_crm.followUps.status.skipped', 'Skipped') : '—'), tone: row.status === 'done' ? 'good' : undefined },
  ]
  const newer = row.others.filter((other) => other.newer)
  const status = STATUS[row.status]

  return (
    <RecordPage
      back={{ href: '/backend/crm/follow-ups', label: t('cc_crm.followUps.title', 'Follow-ups') }}
      overline={t('cc_crm.followUps.overline', 'Follow-up')}
      title={`${t(`cc_crm.followUps.kind.${row.kind}`, row.kindLabel)} · ${formatDay(row.dueOn)}`}
      mono={false}
      badges={<StatusBadge variant={row.overdue ? 'error' : status.variant} dot>{row.overdue ? t('cc_crm.followUps.overdue', 'Overdue') : t(`cc_crm.followUps.status.${row.status}`, status.label)}</StatusBadge>}
      meta={[row.partyName, row.createdByName ? t('cc_crm.followUps.plannedBy', 'planned by {name}', { name: row.createdByName }) : null].filter(Boolean).join(' · ')}
      actions={
        canManage ? (
          <>
            {row.status === 'planned' ? (
              <>
                <Button type="button" size="sm" disabled={busy} onClick={() => open('done')}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_crm.followUps.markDone', 'Mark done')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open('reschedule')}>
                  <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_crm.followUps.reschedule', 'Move date')}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setClosing('skip')}>
                  <SkipForward className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_crm.followUps.skip', 'Skip')}
                </Button>
              </>
            ) : row.canUndo ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setClosing('undo')}>
                <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_crm.followUps.undo', 'Undo')}
              </Button>
            ) : null}
          </>
        ) : null
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_crm.followUps.plan', 'Plan')} icon={PhoneCall}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_crm.followUps.note', 'What to do'), row.note ?? '—'],
                [t('cc_crm.followUps.outcome', 'Outcome'), row.outcome ?? '—'],
                [t('cc_crm.followUps.closed', 'Closed'), row.doneAt ? [new Date(row.doneAt).toLocaleString('en-IN'), row.doneByName].filter(Boolean).join(' · ') : '—'],
              ]}
            />
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_crm.followUps.cameFrom', 'Came from')} flush>
              <LinkRows
                empty={t('cc_crm.followUps.noSource', 'Not linked.')}
                rows={[
                  ...(row.enquiry ? [{ key: 'enq', href: `/backend/crm/enquiries/${row.enquiry.id}`, primary: <span className="font-mono">{row.enquiry.enquiryNo}</span>, secondary: row.enquiry.subject }] : []),
                  ...(row.quotation ? [{ key: 'quote', href: `/backend/crm/quotations/${row.quotation.id}`, primary: <span className="font-mono">{row.quotation.quoteNo}</span>, secondary: t('cc_crm.followUps.quotation', 'Quotation') }] : []),
                  ...(row.customer ? [{ key: 'cust', href: `/backend/customers/companies/${row.customer.id}`, primary: row.customer.name ?? '—', secondary: t('cc_crm.followUps.customer', 'Customer') }] : []),
                ]}
              />
            </Panel>
            <Panel title={t('cc_crm.followUps.wentTo', 'Went to')} flush>
              <LinkRows
                empty={t('cc_crm.followUps.noNext', 'No follow-up after this one yet.')}
                rows={newer.map((other) => ({ key: other.id, href: `/backend/crm/follow-ups/${other.id}`, primary: `${KIND_LABEL[other.kind]} · ${formatDay(other.dueOn)}`, secondary: t(`cc_crm.followUps.status.${other.status}`, STATUS[other.status].label) }))}
              />
            </Panel>
          </>
        }
      />
      <Attachments type="follow_up" id={row.id} hint={t('cc_crm.followUps.filesHint', 'Visit photos, a note of the call.')} />
      <Comments type="follow_up" id={row.id} />
      <Timeline type="follow_up" id={row.id} refreshKey={row.updatedAt} />

      <CorrectDialog
        open={closing !== null}
        onOpenChange={(next) => !next && setClosing(null)}
        destructive={closing === 'skip'}
        title={closing === 'undo' ? t('cc_crm.followUps.undoTitle', 'Undo this follow-up?') : t('cc_crm.followUps.skipTitle', 'Skip this follow-up?')}
        undo={closing === 'undo' ? [t('cc_crm.followUps.undoBack', 'It goes back to planned for {date}', { date: formatDay(row.dueOn) })] : [t('cc_crm.followUps.skipKeep', 'It is closed without an outcome; the reason is kept')]}
        confirmLabel={closing === 'undo' ? t('cc_crm.followUps.undo', 'Undo') : t('cc_crm.followUps.skip', 'Skip')}
        onConfirm={(reason) => act({ action: closing === 'undo' ? 'undo' : 'skip', reason }, closing === 'undo' ? t('cc_crm.followUps.undone', 'Back to planned') : t('cc_crm.followUps.skipped', 'Skipped'))}
      />

      <Dialog open={mode !== null} onOpenChange={(next) => !busy && !next && setMode(null)}>
        <DialogContent
          className="sm:max-w-md"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === 'done' ? t('cc_crm.followUps.doneTitle', 'What came out of it?') : t('cc_crm.followUps.moveTitle', 'Move to another date')}</DialogTitle>
            <DialogDescription>{mode === 'done' ? t('cc_crm.followUps.doneHint', 'Write the outcome. Plan the next follow-up here if there is one.') : t('cc_crm.followUps.moveHint', 'The old date stays in the history with your reason.')}</DialogDescription>
          </DialogHeader>
          {mode === 'done' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fu-outcome">{t('cc_crm.followUps.outcome', 'Outcome')} *</Label>
                <Textarea id="fu-outcome" rows={3} autoFocus value={form.outcome} onChange={(event) => setForm((prev) => ({ ...prev, outcome: event.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fu-next">{t('cc_crm.followUps.nextOn', 'Next follow-up on')}</Label>
                  <Input id="fu-next" type="date" min={today()} value={form.nextOn} onChange={(event) => setForm((prev) => ({ ...prev, nextOn: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fu-kind">{t('cc_crm.followUps.type', 'Type')}</Label>
                  <Select value={form.nextKind} onValueChange={(value) => setForm((prev) => ({ ...prev, nextKind: value as Kind }))}>
                    <SelectTrigger id="fu-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {t(`cc_crm.followUps.kind.${kind}`, KIND_LABEL[kind])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.nextOn ? <Input value={form.nextNote} placeholder={t('cc_crm.followUps.nextNote', 'What to do next time')} onChange={(event) => setForm((prev) => ({ ...prev, nextNote: event.target.value }))} /> : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fu-date">{t('cc_crm.followUps.newDate', 'New date')}</Label>
                <Input id="fu-date" type="date" value={form.dueOn} onChange={(event) => setForm((prev) => ({ ...prev, dueOn: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fu-reason">{t('cc_ui.correct.reason', 'Why? (kept in the history)')} *</Label>
                <Textarea id="fu-reason" rows={2} value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setMode(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" disabled={busy || (mode === 'done' ? form.outcome.trim().length < MIN_REASON : form.reason.trim().length < MIN_REASON || !form.dueOn)} onClick={() => void submit()}>
              {mode === 'done' ? t('cc_crm.followUps.saveDone', 'Save') : t('cc_crm.followUps.saveMove', 'Move')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordPage>
  )
}
