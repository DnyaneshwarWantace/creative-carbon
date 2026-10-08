"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import { ViewOnlyNote } from '../../cc_departments/components/ViewOnlyNote'
import Link from 'next/link'
import { ArrowLeft, Ban, CheckCircle2, History, Printer, RefreshCcw, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { WhatsAppMenu } from '../../cc_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../cc_products/lib/whatsapp'
import { buildPiHtml, printPi } from './piPrint'
import { PI_STATUS, type CompanyView, type PiView } from './types'

const HISTORY: Record<string, string> = { created: 'Drafted', edited: 'Edited', refreshed: 'Lines refreshed from the order', sent: 'Sent to customer', cancelled: 'Cancelled' }

function when(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function ProformaPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canRecord = !granted.ready || granted.has('cc_accounts.record')
  const { runMutation } = useGuardedMutation({ contextId: `cc-pi-${id}` })
  const [pi, setPi] = React.useState<PiView | null>(null)
  const [company, setCompany] = React.useState<CompanyView | null>(null)
  const [phone, setPhone] = React.useState<string | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState({ piDate: '', validUntil: '', advancePercent: '', terms: '', bankDetails: '', notes: '' })
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')

  const apply = (next: PiView) => {
    setPi(next)
    setForm({
      piDate: next.piDate,
      validUntil: next.validUntil ?? '',
      advancePercent: next.advancePercent == null ? '' : String(next.advancePercent),
      terms: next.terms ?? '',
      bankDetails: next.bankDetails ?? '',
      notes: next.notes ?? '',
    })
  }

  const load = React.useCallback(async () => {
    const [call, companyCall] = await Promise.all([apiCall<PiView>(`/api/cc_accounts/proformas?id=${encodeURIComponent(id)}`), apiCall<CompanyView>('/api/cc_accounts/company')])
    if (!call.ok || !call.result) {
      setLoadError(call.status === 404 ? t('cc_accounts.pi.notFound', 'This proforma invoice does not exist.') : t('cc_accounts.pi.loadError', 'Could not load the proforma invoice.'))
      return
    }
    apply(call.result)
    setCompany(companyCall.ok ? (companyCall.result ?? null) : null)
    const order = await apiCall<{ customer?: { phone?: string | null } | null }>(`/api/cc_orders/orders?id=${encodeURIComponent(call.result.orderId)}`)
    setPhone(order.result?.customer?.phone ?? null)
  }, [id, t])

  React.useEffect(() => {
    load()
  }, [load])

  const send = async (url: string, body: Record<string, unknown>, success: string) => {
    if (!pi) return false
    setBusy(true)
    try {
      const call = await runMutation({
        context: { piId: pi.id, url },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(pi.updatedAt), () =>
            apiCall<PiView & { error?: string }>(url, { method: url.endsWith('/action') ? 'POST' : 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result) {
        flash(
          call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
            ? t('cc_accounts.pi.conflict', 'Someone else changed this proforma. Reloaded the latest.')
            : (call.result?.error ?? t('cc_accounts.pi.saveError', 'Could not save.')),
          'error',
        )
        if (call.status === 409) await load()
        return false
      }
      apply(call.result)
      flash(success, 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    send(
      '/api/cc_accounts/proformas',
      {
        id,
        piDate: form.piDate,
        validUntil: form.validUntil || null,
        advancePercent: form.advancePercent.trim() === '' ? null : Number(form.advancePercent),
        terms: form.terms,
        bankDetails: form.bankDetails,
        notes: form.notes,
      },
      t('cc_accounts.pi.saved', 'Proforma saved'),
    )

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
            <ErrorMessage label={loadError} />
            <Button asChild variant="outline">
              <Link href="/backend/accounts/proformas">{t('cc_accounts.pi.back', 'All proforma invoices')}</Link>
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }
  if (!pi || !company) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_accounts.pi.loading', 'Loading proforma invoice…')} />
        </PageBody>
      </Page>
    )
  }

  const editable = pi.status !== 'cancelled' && canRecord
  const status = PI_STATUS[pi.status]
  const message = [
    `Dear ${pi.customerName},`,
    '',
    `Please find our proforma invoice ${pi.code} dated ${dateText(pi.piDate)} for order ${pi.orderNo}.`,
    ...pi.lines.map((line, index) => `${index + 1}. ${line.brandName ? `${line.brandName} ` : ''}${line.title}: ${line.quantity} pcs × ${line.rate == null ? '—' : rupeeText(line.rate)}`),
    '',
    `Total with GST: ${rupeeText(pi.totals.total)}`,
    pi.advancePercent ? `Advance ${pi.advancePercent}% to confirm the order: ${rupeeText(pi.advanceAmount ?? 0)}` : null,
    pi.validUntil ? `Valid until ${dateText(pi.validUntil)}` : null,
    pi.bankDetails ? `\nBank details:\n${pi.bankDetails}` : null,
    '',
    'Please share the UTR once paid.',
    '',
    `Thank you,\n${company.name}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-16">
          <header className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/accounts/proformas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {t('cc_accounts.pi.back', 'All proforma invoices')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-bold">{pi.code}</h1>
                <StatusBadge variant={status.variant} dot>
                  {t(`cc_accounts.pi.status.${pi.status}`, status.label)}
                </StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{pi.customerName}</span> ·{' '}
                <Link href={`/backend/orders/${pi.orderId}`} className="font-mono text-primary hover:underline">
                  {pi.orderNo}
                </Link>{' '}
                · {rupeeText(pi.totals.total)}
                {pi.advancePercent ? ` · ${t('cc_accounts.pi.advanceShort', 'advance {pct}% = {amount}', { pct: pi.advancePercent, amount: rupeeText(pi.advanceAmount ?? 0) })}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
              <WhatsAppMenu phone={phone} recipient={pi.customerName} messages={[{ key: 'pi', label: t('cc_accounts.pi.waLabel', 'Send the proforma details'), hint: `${pi.code} · ${rupeeText(pi.totals.total)}`, text: message }]} size="default" />
              <Button type="button" variant="outline" onClick={() => (printPi(pi, company) ? null : flash(t('cc_accounts.pi.popup', 'Allow pop-ups to print'), 'error'))}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.pi.print', 'Print / PDF')}
              </Button>
              {canRecord && pi.status === 'draft' ? (
                <Button type="button" onClick={() => send('/api/cc_accounts/proformas/action', { id, action: 'send' }, t('cc_accounts.pi.sentFlash', 'Marked as sent; the order Advance stage has the PI no.'))} disabled={busy}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.pi.markSent', 'Mark as sent')}
                </Button>
              ) : null}
              {canRecord && pi.status !== 'cancelled' ? (
                <Button type="button" variant="destructive-ghost" onClick={() => setCancelOpen(true)} disabled={busy}>
                  <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.pi.cancel', 'Cancel')}
                </Button>
              ) : null}
            </div>
          </header>
          {!canRecord ? <ViewOnlyNote>{t('cc_accounts.viewOnly', 'View only: making, issuing and cancelling documents is done by Accounts.')}</ViewOnlyNote> : null}

          {pi.status === 'cancelled' ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{t('cc_accounts.pi.cancelledNote', 'Cancelled: {reason}', { reason: pi.cancelReason ?? '—' })}</p>
          ) : null}
          {cancelOpen ? (
            <div className="space-y-2 rounded-lg border border-status-error-border bg-status-error-bg p-3">
              <Label htmlFor="pi-cancel" className="text-sm text-status-error-text">
                {t('cc_accounts.pi.cancelWhy', 'Why is this proforma cancelled?')}
              </Label>
              <Textarea id="pi-cancel" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    if (await send('/api/cc_accounts/proformas/action', { id, action: 'cancel', reason }, t('cc_accounts.pi.cancelled', 'Proforma cancelled'))) {
                      setCancelOpen(false)
                      setReason('')
                    }
                  }}
                >
                  {t('cc_accounts.pi.confirmCancel', 'Cancel the proforma')}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="overflow-hidden rounded-lg border bg-card shadow-xs lg:col-span-2">
              <iframe title={pi.code} srcDoc={buildPiHtml(pi, company, false)} className="h-screen w-full bg-background" />
            </div>
            <div className="flex flex-col gap-4">
              <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs">
                <h2 className="text-sm font-semibold">{t('cc_accounts.pi.details', 'Proforma details')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pi-date" className="text-xs text-muted-foreground">{t('cc_accounts.pi.date', 'PI date')}</Label>
                    <Input id="pi-date" type="date" value={form.piDate} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, piDate: event.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pi-valid" className="text-xs text-muted-foreground">{t('cc_accounts.pi.valid', 'Valid until')}</Label>
                    <Input id="pi-valid" type="date" value={form.validUntil} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, validUntil: event.target.value }))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="pi-adv" className="text-xs text-muted-foreground">{t('cc_accounts.pi.advance', 'Advance % to confirm the order')}</Label>
                    <Input id="pi-adv" type="number" min={0} max={100} step="any" value={form.advancePercent} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, advancePercent: event.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pi-bank" className="text-xs text-muted-foreground">{t('cc_accounts.pi.bank', 'Bank details')}</Label>
                  <Textarea id="pi-bank" rows={4} value={form.bankDetails} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, bankDetails: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pi-terms" className="text-xs text-muted-foreground">{t('cc_accounts.pi.terms', 'Terms')}</Label>
                  <Textarea id="pi-terms" rows={5} value={form.terms} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, terms: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pi-notes" className="text-xs text-muted-foreground">{t('cc_accounts.pi.notes', 'Note to the customer')}</Label>
                  <Textarea id="pi-notes" rows={2} value={form.notes} disabled={!editable} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                {editable ? (
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => send('/api/cc_accounts/proformas', { id, refreshLines: true }, t('cc_accounts.pi.refreshed', 'Lines and totals taken again from the order'))} disabled={busy}>
                      <RefreshCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_accounts.pi.refresh', 'Refresh from order')}
                    </Button>
                    <Button type="button" size="sm" onClick={save} disabled={busy}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_accounts.pi.save', 'Save')}
                    </Button>
                  </div>
                ) : null}
              </section>
              <section className="space-y-2 rounded-lg border bg-card p-4 shadow-xs">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('cc_accounts.pi.history', 'History')}
                </h2>
                <ol className="space-y-2 border-l pl-3 text-xs">
                  {[...pi.history].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <span className="font-medium">{HISTORY[entry.action] ?? entry.action}</span>
                      <span className="text-muted-foreground"> · {entry.by ?? '—'}, {when(entry.at)}</span>
                      {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default ProformaPage
