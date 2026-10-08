"use client"

import * as React from 'react'
import { Beaker, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, thisMonth, todayIso, type ResinSetup } from './shared'
import { OfflineBadge, isOffline, queueSave } from '../offline'

type Issue = { id: string; issueDate: string; productTitle: string; kg: number; usedFor: 'coating' | 'other'; dryerCode: string | null; note: string | null; lots: Array<{ lotNumber: string | null; kg: number }>; status: 'posted' | 'cancelled'; byName: string | null; updatedAt: string }
type Dryer = { id: string; code: string }

const EMPTY = { issueDate: todayIso(), productId: '', kg: '', usedFor: 'coating' as 'coating' | 'other', dryerCode: '', note: '' }

export function ChemicalIssuesPage() {
  const t = useT()
  const granted = useGranted()
  const canIssue = granted.has('cc_production.chemicals.issue')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-chemical-issues' })
  const [setup, setSetup] = React.useState<ResinSetup | null>(null)
  const [dryers, setDryers] = React.useState<Dryer[]>([])
  const [month, setMonth] = React.useState(thisMonth())
  const [items, setItems] = React.useState<Issue[] | null>(null)
  const [form, setForm] = React.useState(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [cancelling, setCancelling] = React.useState<Issue | null>(null)
  const [reason, setReason] = React.useState('')

  const loadSetup = React.useCallback(async () => {
    const [setupCall, dryerCall] = await Promise.all([
      apiCall<ResinSetup>('/api/cc_production/resin/setup'),
      apiCall<{ items: Dryer[] }>('/api/cc_production/masters?type=dryers&includeInactive=false', undefined, { fallback: { items: [] } }),
    ])
    if (setupCall.result) {
      setSetup(setupCall.result)
      setForm((current) => (current.productId ? current : { ...current, productId: setupCall.result!.chemicals.find((chemical) => !chemical.standard)?.id ?? setupCall.result!.chemicals[0]?.id ?? '' }))
    }
    setDryers(dryerCall.result?.items ?? [])
  }, [])

  const load = React.useCallback(async () => {
    setItems(null)
    const call = await apiCall<{ items: Issue[] }>(`/api/cc_production/resin/issues?month=${month}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [month])

  React.useEffect(() => {
    void loadSetup()
  }, [loadSetup])

  React.useEffect(() => {
    void load()
  }, [load])

  const chemical = setup?.chemicals.find((entry) => entry.id === form.productId)

  const submit = async () => {
    const body = { issueDate: form.issueDate, productId: form.productId, kg: Number(form.kg.replace(/,/g, '')), usedFor: form.usedFor, dryerCode: form.usedFor === 'coating' ? form.dryerCode : null, note: form.note.trim() || null }
    if (!body.productId || !(body.kg > 0)) {
      flash(t('cc_production.issues.fill', 'Pick the chemical and enter the kg'), 'error')
      return
    }
    if (isOffline()) {
      queueSave({ screen: 'Chemical issue', recordRef: `${body.issueDate} ${body.productId} ${Date.now()}`, path: '/api/cc_production/resin/issues', method: 'POST', body, updatedAt: null })
      flash(t('cc_production.offline.queued', 'Saved on this phone. It will sync when the network is back.'), 'success')
      setForm({ ...EMPTY, issueDate: form.issueDate, productId: form.productId, usedFor: form.usedFor, dryerCode: form.dryerCode })
      return
    }
    setBusy(true)
    try {
      const call = await runMutation({
        context: {},
        mutationPayload: body,
        operation: () => apiCall<Issue & { error?: string }>('/api/cc_production/resin/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.issues.error', 'Could not issue it.'), 'error')
        return
      }
      flash(t('cc_production.issues.done', 'Issued. Taken out of stock, oldest lot first.'), 'success')
      setForm({ ...EMPTY, issueDate: form.issueDate, productId: form.productId, usedFor: form.usedFor, dryerCode: form.dryerCode })
      await Promise.all([load(), loadSetup()])
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!cancelling || !reason.trim()) return
    const body = { id: cancelling.id, reason: reason.trim() }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { issueId: cancelling.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(cancelling.updatedAt), () =>
            apiCall<Issue & { error?: string }>('/api/cc_production/resin/issues/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.issues.cancelError', 'Could not cancel it.'), 'error')
        return
      }
      flash(t('cc_production.issues.cancelled', 'Cancelled. The stock is back in the same lots.'), 'success')
      setCancelling(null)
      setReason('')
      await Promise.all([load(), loadSetup()])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
          <header className="space-y-1">
            <OfflineBadge onSynced={() => void load()} />
            <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.resin.plant', 'Resin plant')}</p>
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.issues.title', 'Chemical issue')}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t('cc_production.issues.lede', 'Methanol, DBP and oleic acid that go to the coating dryers, or chemicals used anywhere else outside a resin batch. Without these the chemical register would never match the book.')}
            </p>
          </header>

          {canIssue ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-1.5">
                  <Label htmlFor="issue-date">{t('cc_production.resin.date', 'Date')}</Label>
                  <Input id="issue-date" type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} />
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="issue-item">{t('cc_production.register.item', 'Chemical')}</Label>
                  <select id="issue-item" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
                    {(setup?.chemicals ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title} · {kg(option.free)} kg
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="issue-kg">kg</Label>
                  <Input id="issue-kg" inputMode="decimal" value={form.kg} onChange={(event) => setForm({ ...form, kg: event.target.value })} />
                  {chemical ? <p className="text-xs text-muted-foreground">{t('cc_production.issues.free', '{kg} kg in stock', { kg: kg(chemical.free) })}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="issue-for">{t('cc_production.issues.usedFor', 'Used for')}</Label>
                  <select id="issue-for" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.usedFor} onChange={(event) => setForm({ ...form, usedFor: event.target.value as 'coating' | 'other' })}>
                    <option value="coating">{t('cc_production.issues.coating', 'Coating dryer')}</option>
                    <option value="other">{t('cc_production.issues.other', 'Other')}</option>
                  </select>
                </div>
                {form.usedFor === 'coating' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="issue-dryer">{t('cc_production.issues.dryer', 'Dryer')}</Label>
                    <select id="issue-dryer" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.dryerCode} onChange={(event) => setForm({ ...form, dryerCode: event.target.value })}>
                      <option value="">—</option>
                      {dryers.map((dryer) => (
                        <option key={dryer.id} value={dryer.code}>
                          {dryer.code}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
                  <Label htmlFor="issue-note">{t('cc_production.issues.note', 'Note')}</Label>
                  <Input id="issue-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
                    {t('cc_production.issues.issue', 'Issue')}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex justify-end">
            <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t('cc_production.register.month', 'Month')} />
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState className="py-14" variant="subtle" icon={<Beaker className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.issues.empty', 'No chemical issues this month')} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((issue) => (
                  <li key={issue.id} className="grid grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-12">
                    <p className="text-sm md:col-span-2">{day(issue.issueDate)}</p>
                    <p className="text-sm font-medium md:col-span-3">{issue.productTitle}</p>
                    <p className="text-sm tabular-nums md:col-span-2">{kg(issue.kg)} kg</p>
                    <p className="text-xs text-muted-foreground md:col-span-3">
                      {issue.usedFor === 'coating' ? `${t('cc_production.issues.coating', 'Coating dryer')} ${issue.dryerCode ?? ''}` : t('cc_production.issues.other', 'Other')}
                      {issue.note ? ` · ${issue.note}` : ''}
                      {issue.lots.length ? ` · ${issue.lots.map((lot) => lot.lotNumber ?? '—').join(', ')}` : ''}
                    </p>
                    <div className="flex items-center justify-end gap-2 md:col-span-2">
                      {issue.status === 'cancelled' ? (
                        <StatusBadge variant="neutral">{t('cc_production.issues.cancelledBadge', 'Cancelled')}</StatusBadge>
                      ) : canIssue ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(issue)}>
                          <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          {t('cc_production.issues.cancel', 'Cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <Dialog open={Boolean(cancelling)} onOpenChange={(open) => !open && setCancelling(null)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void cancel()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_production.issues.cancelTitle', 'Cancel this issue?')}</DialogTitle>
              <DialogDescription>{t('cc_production.issues.cancelHint', 'The kg go back into the same stock lots.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="issue-cancel-reason">{t('cc_production.issues.why', 'Why')}</Label>
              <Textarea id="issue-cancel-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelling(null)}>
                {t('cc_production.resin.cancel', 'Cancel')}
              </Button>
              <Button type="button" disabled={busy || !reason.trim()} onClick={() => void cancel()}>
                {t('cc_production.issues.confirmCancel', 'Cancel the issue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default ChemicalIssuesPage
