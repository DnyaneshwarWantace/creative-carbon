"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, FileText, Flag, MessageSquare, Pencil, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker } from '../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../cc_orders/components/loaders'
import { formatDate, formatDateTime, formatQty } from '../../cc_orders/components/format'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import { useGranted } from '../../cc_departments/components/useGranted'
import { useSend, selectClass } from '../../cc_production/components/finishing/shared'
import { QUOTE_LABEL, QUOTE_VARIANT, STAGE_LABEL, STAGE_VARIANT, type Enquiry, type EnquiryStage } from './types'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { FieldList, HistoryPanel, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'

function localNow(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return now.toISOString().slice(0, 16)
}

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function addDays(days: number): string {
  return new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
}

type Draft = { source: string; receivedAt: string; customer: { id: string; name: string } | null; companyName: string; contactName: string; phone: string; email: string; place: string; subject: string; details: string; ownerName: string; nextActionOn: string; nextActionNote: string }

function draftOf(enquiry: Enquiry | null): Draft {
  if (!enquiry) return { source: '', receivedAt: localNow(), customer: null, companyName: '', contactName: '', phone: '', email: '', place: '', subject: '', details: '', ownerName: '', nextActionOn: addDays(1), nextActionNote: '' }
  return {
    source: enquiry.source,
    receivedAt: toLocalInput(enquiry.receivedAt),
    customer: enquiry.customerId ? { id: enquiry.customerId, name: enquiry.customerName ?? '' } : null,
    companyName: enquiry.companyName ?? '',
    contactName: enquiry.contactName ?? '',
    phone: enquiry.phone ?? '',
    email: enquiry.email ?? '',
    place: enquiry.place ?? '',
    subject: enquiry.subject,
    details: enquiry.details ?? '',
    ownerName: enquiry.ownerName ?? '',
    nextActionOn: enquiry.nextActionOn ?? '',
    nextActionNote: enquiry.nextActionNote ?? '',
  }
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  )
}

export function EnquiryForm({ enquiry }: { enquiry: Enquiry | null }) {
  const t = useT()
  const router = useRouter()
  const send = useSend(`cc-enquiry-${enquiry?.id ?? 'new'}`)
  const sources = useListOptions('enquiry_sources', enquiry?.source)
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(enquiry))
  const [saving, setSaving] = React.useState(false)
  const patch = (value: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...value }))
  const backHref = enquiry ? `/backend/crm/enquiries/${enquiry.id}` : '/backend/crm/enquiries'

  const save = async () => {
    if (!draft.source || !draft.subject.trim() || !draft.receivedAt) {
      flash(t('cc_crm.errors.enquiry', 'Enter the source, when it came in and what they asked for.'), 'error')
      return
    }
    if (!draft.customer && !draft.companyName.trim() && !draft.contactName.trim()) {
      flash(t('cc_crm.errors.party', 'Enter the company or the person who asked (or pick an existing customer).'), 'error')
      return
    }
    setSaving(true)
    const body = {
      ...(enquiry ? { id: enquiry.id } : {}),
      source: draft.source,
      receivedAt: new Date(draft.receivedAt).toISOString(),
      customerId: draft.customer?.id ?? null,
      companyName: draft.customer ? null : draft.companyName,
      contactName: draft.contactName,
      phone: draft.phone,
      email: draft.email,
      place: draft.place,
      subject: draft.subject,
      details: draft.details,
      ownerName: draft.ownerName,
      nextActionOn: draft.nextActionOn || null,
      nextActionNote: draft.nextActionNote,
    }
    const result = await send<Enquiry>('/api/cc_crm/enquiries', enquiry ? 'PUT' : 'POST', body, enquiry?.updatedAt, t('cc_crm.errors.save', 'Could not save the enquiry.'))
    setSaving(false)
    if (!result) return
    flash(enquiry ? t('cc_crm.flash.saved', 'Enquiry saved') : t('cc_crm.flash.created', 'Enquiry {no} logged', { no: result.enquiryNo }), 'success')
    router.push(`/backend/crm/enquiries/${result.id}`)
  }

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-4xl space-y-5 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') router.push(backHref)
          }}
        >
          <div className="flex items-center gap-3 border-b pb-4">
            <Button type="button" variant="ghost" size="icon" onClick={() => router.push(backHref)} aria-label={t('common.back', 'Back')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{enquiry ? t('cc_crm.form.editEnquiry', 'Edit enquiry {no}', { no: enquiry.enquiryNo }) : t('cc_crm.form.newEnquiry', 'Log an enquiry')}</h1>
              <p className="text-xs text-muted-foreground">{t('cc_crm.form.enquiryHint', 'The enquiry number is given when you save. Set the next follow-up so it is not forgotten.')}</p>
            </div>
          </div>
          <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-5 shadow-xs md:grid-cols-6">
            <Field label={t('cc_crm.enquiries.source', 'Source')} required className="md:col-span-2">
              <Dropdown value={draft.source} onChange={(event) => patch({ source: event.target.value })}>
                <option value="">—</option>
                {sources.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Dropdown>
            </Field>
            <Field label={t('cc_crm.enquiries.received', 'Received')} required className="md:col-span-2">
              <Input type="datetime-local" value={draft.receivedAt} onChange={(event) => patch({ receivedAt: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.enquiries.owner', 'Owner')} className="md:col-span-2">
              <Input value={draft.ownerName} onChange={(event) => patch({ ownerName: event.target.value })} placeholder={t('cc_crm.form.ownerHint', 'You, if left blank')} />
            </Field>
            <Field label={t('cc_crm.form.existingCustomer', 'Existing customer')} className="md:col-span-3">
              <SearchPicker
                value={draft.customer ? { id: draft.customer.id, primary: draft.customer.name, value: draft.customer } : null}
                placeholder={t('cc_crm.form.customerPick', 'Pick if they already buy from us')}
                searchPlaceholder={t('cc_orders.form.customerSearch', 'Type a customer name')}
                load={async (query) => (await searchCustomers(query)).map((option) => ({ ...option, value: { id: option.id, name: option.primary } }))}
                onSelect={(option) => patch({ customer: option.value })}
              />
              {draft.customer ? (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => patch({ customer: null })}>
                  {t('cc_crm.form.clearCustomer', 'Not this customer — new party')}
                </button>
              ) : null}
            </Field>
            {draft.customer ? null : (
              <Field label={t('cc_crm.form.companyName', 'Company (new party)')} className="md:col-span-3">
                <Input value={draft.companyName} onChange={(event) => patch({ companyName: event.target.value })} />
              </Field>
            )}
            <Field label={t('cc_crm.form.contactName', 'Person')} className="md:col-span-2">
              <Input value={draft.contactName} onChange={(event) => patch({ contactName: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.form.phone', 'Phone / WhatsApp')} className="md:col-span-2">
              <Input value={draft.phone} onChange={(event) => patch({ phone: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.form.email', 'Email')} className="md:col-span-2">
              <Input type="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.form.place', 'City / country')} className="md:col-span-2">
              <Input value={draft.place} onChange={(event) => patch({ place: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.enquiries.subject', 'Asked for')} required className="md:col-span-4">
              <Input value={draft.subject} onChange={(event) => patch({ subject: event.target.value })} placeholder="e.g. F2F3 10x10 sheets 25 mm, 500 kg" />
            </Field>
            <Field label={t('cc_crm.form.details', 'Details (paste the message)')} className="md:col-span-6">
              <Textarea rows={4} value={draft.details} onChange={(event) => patch({ details: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.enquiries.next', 'Next follow-up')} className="md:col-span-2">
              <Input type="date" value={draft.nextActionOn} onChange={(event) => patch({ nextActionOn: event.target.value })} />
            </Field>
            <Field label={t('cc_crm.form.nextNote', 'What to do then')} className="md:col-span-4">
              <Input value={draft.nextActionNote} onChange={(event) => patch({ nextActionNote: event.target.value })} placeholder={t('cc_crm.form.nextNoteHint', 'e.g. send rates, call back')} />
            </Field>
          </section>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('cc_orders.form.saving', 'Saving…') : t('cc_crm.form.saveEnquiry', 'Save enquiry')}
            </Button>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export function EnquiryEdit({ enquiryId }: { enquiryId: string }) {
  const t = useT()
  const [enquiry, setEnquiry] = React.useState<Enquiry | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    apiCall<Enquiry>(`/api/cc_crm/enquiries?id=${encodeURIComponent(enquiryId)}`).then((call) => {
      if (call.ok && call.result) setEnquiry(call.result)
      else setError(t('cc_crm.errors.load', 'Could not load the enquiry.'))
    })
  }, [enquiryId, t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!enquiry) return <Page><PageBody><PageLoading label={t('cc_crm.loading', 'Loading…')} /></PageBody></Page>
  return <EnquiryForm enquiry={enquiry} />
}

const NEXT_STAGES: EnquiryStage[] = ['new', 'quoted', 'negotiating', 'won', 'lost']

export function EnquiryPage({ enquiryId }: { enquiryId: string }) {
  const t = useT()
  const granted = useGranted()
  const canManage = granted.has('cc_crm.manage')
  const send = useSend(`cc-enquiry-${enquiryId}`)
  const lostReasons = useListOptions('lost_reasons')
  const [enquiry, setEnquiry] = React.useState<Enquiry | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [followUp, setFollowUp] = React.useState({ on: addDays(2), note: '' })
  const [note, setNote] = React.useState('')
  const [lostReason, setLostReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Enquiry>(`/api/cc_crm/enquiries?id=${encodeURIComponent(enquiryId)}`)
    if (call.ok && call.result) setEnquiry(call.result)
    else setError(t('cc_crm.errors.load', 'Could not load the enquiry.'))
  }, [enquiryId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const act = async (body: Record<string, unknown>, done: string) => {
    if (!enquiry) return
    setBusy(true)
    const result = await send<Enquiry>('/api/cc_crm/enquiries/action', 'POST', { id: enquiry.id, ...body }, enquiry.updatedAt)
    setBusy(false)
    if (!result) return
    setEnquiry(result)
    flash(done, 'success')
  }

  if (error || !enquiry) return <RecordState error={error} loadingLabel={t('cc_crm.loading', 'Loading…')} />

  const quoteHref = `/backend/crm/quotations/new?enquiryId=${enquiry.id}${enquiry.customerId ? `&customerId=${enquiry.customerId}` : ''}`
  const closed = enquiry.stage === 'won' || enquiry.stage === 'lost'
  const quotes = enquiry.quotations ?? []
  const ageDays = Math.max(0, Math.round((Date.now() - new Date(enquiry.receivedAt).getTime()) / 86_400_000))
  const facts: Fact[] = [
    { label: t('cc_crm.enquiries.received', 'Came in'), value: formatDate(enquiry.receivedAt), hint: t('cc_crm.enquiries.daysAgo', '{days} days ago', { days: ageDays }) },
    { label: t('cc_crm.enquiries.source', 'Source'), value: enquiry.source },
    { label: t('cc_crm.enquiries.owner', 'Owner'), value: enquiry.ownerName ?? '—' },
    { label: t('cc_crm.enquiries.next', 'Next follow-up'), value: enquiry.nextActionOn ? formatDate(enquiry.nextActionOn) : '—', tone: enquiry.overdue ? 'bad' : undefined },
    { label: t('cc_crm.quotations.title', 'Quotations'), value: String(quotes.length) },
    { label: t('cc_crm.enquiries.order', 'Order'), value: quotes.find((quote) => quote.orderNo)?.orderNo ?? '—', tone: enquiry.stage === 'won' ? 'good' : undefined },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/crm/enquiries', label: t('cc_crm.nav.enquiries', 'Enquiries') }}
      overline={[t('cc_crm.enquiries.overline', 'Enquiry'), enquiry.partyName].filter(Boolean).join(' · ')}
      title={enquiry.enquiryNo}
      badges={
        <>
          <StatusBadge variant={STAGE_VARIANT[enquiry.stage]}>{t(`cc_crm.stage.${enquiry.stage}`, STAGE_LABEL[enquiry.stage])}</StatusBadge>
          {enquiry.overdue ? <StatusBadge variant="error">{t('cc_crm.enquiries.overdue', 'Follow-up overdue')}</StatusBadge> : null}
        </>
      }
      meta={`${enquiry.source} · ${formatDateTime(enquiry.receivedAt)}`}
      actions={
        canManage ? (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/backend/crm/enquiries/${enquiry.id}/edit`}>
                <Pencil className="mr-1.5 h-4 w-4" />
                {t('cc_crm.actions.edit', 'Edit')}
              </Link>
            </Button>
            {closed ? null : (
              <Button asChild size="sm">
                <Link href={quoteHref}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.actions.quote', 'Make quotation')}
                </Link>
              </Button>
            )}
          </>
        ) : undefined
      }
      alert={enquiry.stage === 'lost' ? <p className="rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-sm text-status-error-text">{t('cc_crm.enquiries.lostBecause', 'Lost: {reason}', { reason: enquiry.lostReason ?? '—' })}</p> : null}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={enquiry.subject} icon={MessageSquare}>
              {enquiry.details ? <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{enquiry.details}</p> : null}
              <FieldList
                fields={[
                  [t('cc_crm.form.contactName', 'Person'), enquiry.contactName],
                  [t('cc_crm.form.phone', 'Phone / WhatsApp'), enquiry.phone],
                  [t('cc_crm.form.email', 'Email'), enquiry.email],
                  [t('cc_crm.form.place', 'City / country'), enquiry.place],
                  [
                    t('cc_crm.form.customer', 'Customer'),
                    enquiry.customerId ? (
                      <Link key="customer" className="underline-offset-2 hover:underline" href={recordHref.customer(enquiry.customerId)}>
                        {enquiry.customerName}
                      </Link>
                    ) : (
                      t('cc_crm.enquiries.notCustomer', 'Not a customer yet')
                    ),
                  ],
                  [t('cc_crm.enquiries.owner', 'Owner'), enquiry.ownerName],
                ]}
              />
            </Panel>

            <Panel title={t('cc_crm.quotations.title', 'Quotations')} icon={FileText} count={quotes.length} flush>
              <RegisterGrid
                rows={quotes}
                rowKey={(quote) => quote.id}
                rowHref={(quote) => recordHref.quotation(quote.id)}
                empty={t('cc_crm.quotations.none', 'No quotation yet.')}
                columns={[
                  { key: 'no', label: t('cc_crm.quotations.no', 'Quotation'), mono: true, render: (quote) => quote.quoteNo },
                  { key: 'date', label: t('cc_crm.quotations.date', 'Date'), render: (quote) => formatDate(quote.quoteDate) },
                  { key: 'status', label: t('cc_crm.quotations.status', 'Status'), render: (quote) => <StatusBadge variant={QUOTE_VARIANT[quote.status]}>{t(`cc_crm.quote.${quote.status}`, QUOTE_LABEL[quote.status])}</StatusBadge> },
                  {
                    key: 'order',
                    label: t('cc_crm.enquiries.order', 'Order'),
                    render: (quote) =>
                      quote.orderId ? (
                        <Link className="font-mono text-xs underline-offset-2 hover:underline" href={recordHref.order(quote.orderId)}>
                          {quote.orderNo}
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                  { key: 'value', label: t('cc_crm.quotations.total', 'Value'), align: 'right', render: (quote) => `${quote.currency} ${formatQty(quote.totalAmount, 2)}` },
                ]}
              />
            </Panel>
          </>
        }
        side={
          canManage ? (
            <>
              <Panel title={t('cc_crm.enquiries.next', 'Next follow-up')} icon={CalendarClock}>
                <div className="space-y-3">
                  <p className={cn('text-sm', enquiry.overdue && 'font-semibold text-status-error-text')}>
                    {enquiry.nextActionOn ? formatDate(enquiry.nextActionOn) : '—'}
                    {enquiry.nextActionNote ? <span className="block text-xs font-normal text-muted-foreground">{enquiry.nextActionNote}</span> : null}
                  </p>
                  {closed ? null : (
                    <>
                      <Input type="date" value={followUp.on} onChange={(event) => setFollowUp((prev) => ({ ...prev, on: event.target.value }))} aria-label={t('cc_crm.enquiries.next', 'Next follow-up')} />
                      <Input value={followUp.note} onChange={(event) => setFollowUp((prev) => ({ ...prev, note: event.target.value }))} placeholder={t('cc_crm.form.nextNoteHint', 'e.g. send rates, call back')} />
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'follow_up', nextActionOn: followUp.on, nextActionNote: followUp.note }, t('cc_crm.flash.followUp', 'Follow-up set'))}>
                        {t('cc_crm.actions.followUp', 'Set follow-up')}
                      </Button>
                    </>
                  )}
                </div>
              </Panel>

              <Panel title={t('cc_crm.enquiries.stage', 'Stage')} icon={Flag}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {NEXT_STAGES.filter((stage) => stage !== enquiry.stage && stage !== 'lost').map((stage) => (
                      <Button key={stage} type="button" size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'stage', stage }, t('cc_crm.flash.stage', 'Stage changed'))}>
                        {t(`cc_crm.stage.${stage}`, STAGE_LABEL[stage])}
                      </Button>
                    ))}
                  </div>
                  {enquiry.stage === 'lost' ? null : (
                    <div className="flex gap-2">
                      <Dropdown value={lostReason} onChange={(event) => setLostReason(event.target.value)} aria-label={t('cc_crm.enquiries.lostReason', 'Lost reason')}>
                        <option value="">{t('cc_crm.enquiries.lostPick', 'Lost because…')}</option>
                        {lostReasons.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Dropdown>
                      <Button type="button" size="sm" variant="outline" disabled={busy || !lostReason} onClick={() => act({ action: 'stage', stage: 'lost', lostReason }, t('cc_crm.flash.lost', 'Marked lost'))}>
                        {t('cc_crm.actions.lost', 'Mark lost')}
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title={t('cc_crm.actions.note', 'Add a note')} icon={MessageSquare}>
                <div className="space-y-3">
                  <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('cc_crm.form.noteHint', 'What the customer said')} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !note.trim()}
                    onClick={async () => {
                      await act({ action: 'note', note }, t('cc_crm.flash.note', 'Note added'))
                      setNote('')
                    }}
                  >
                    {t('cc_crm.actions.saveNote', 'Save note')}
                  </Button>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title={t('cc_crm.enquiries.next', 'Next follow-up')} icon={CalendarClock}>
              <p className={cn('text-sm', enquiry.overdue && 'font-semibold text-status-error-text')}>{enquiry.nextActionOn ? formatDate(enquiry.nextActionOn) : '—'}</p>
            </Panel>
          )
        }
      />
      <HistoryPanel entries={[...enquiry.history].reverse().map((item, index) => ({ key: `${item.at}-${index}`, label: <span className="first-letter:uppercase">{item.action.replace(/_/g, ' ')}</span>, note: item.note, by: item.by, at: item.at }))} />
    </RecordPage>
  )
}

export default EnquiryPage
