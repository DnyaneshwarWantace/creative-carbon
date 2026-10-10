"use client"

import * as React from 'react'
import Link from 'next/link'
import { Beaker, Printer, Undo2, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref } from '../../../cc_ui/lib/links'
import { HISTORY_LABEL, day, kg, when } from './shared'
import { Timeline } from '../../../cc_ui/components/Timeline'

type IssueView = {
  id: string
  issueDate: string
  productId: string
  productTitle: string
  kg: number
  usedFor: 'coating' | 'other'
  dryerCode: string | null
  note: string | null
  lots: Array<{ lotId: string; lotNumber: string | null; place: string; kg: number; grnId: string | null; grnCode: string | null }>
  status: 'posted' | 'cancelled'
  byName: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  updatedAt: string
  createdAt: string
  coatingSheet: { id: string; sheetDate: string; dryerCode: string; status: string } | null
}

export function ChemicalIssuePage({ issueId }: { issueId: string }) {
  const t = useT()
  const granted = useGranted()
  const canIssue = granted.has('cc_production.chemicals.issue')
  const { runMutation } = useGuardedMutation({ contextId: `cc-chemical-issue-${issueId}` })
  const [issue, setIssue] = React.useState<IssueView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cancelling, setCancelling] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<IssueView>(`/api/cc_production/resin/issues?id=${encodeURIComponent(issueId)}`)
    if (!call.ok || !call.result) setError(t('cc_production.issues.loadError', 'Could not load this chemical issue.'))
    else setIssue(call.result)
  }, [issueId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const cancel = async () => {
    if (!issue || !reason.trim()) return
    const body = { id: issue.id, reason: reason.trim() }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { issueId: issue.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(issue.updatedAt), () =>
            apiCall<{ error?: string }>('/api/cc_production/resin/issues/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || call.result?.error) {
        flash(call.result?.error ?? t('cc_production.issues.cancelError', 'Could not cancel it.'), 'error')
        return
      }
      flash(t('cc_production.issues.cancelled', 'Cancelled. The stock is back in the same lots.'), 'success')
      setCancelling(false)
      setReason('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (error || !issue) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const usedFor = issue.usedFor === 'coating' ? `${t('cc_production.issues.coating', 'Coating dryer')} ${issue.dryerCode ?? ''}` : t('cc_production.issues.other', 'Other')
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(issue.issueDate) },
    {
      label: t('cc_production.register.item', 'Chemical'),
      value: (
        <Link className="underline-offset-2 hover:underline" href={recordHref.product(issue.productId)}>
          {issue.productTitle}
        </Link>
      ),
    },
    { label: 'kg', value: kg(issue.kg) },
    { label: t('cc_production.issues.usedFor', 'Used for'), value: usedFor },
    { label: t('cc_production.issues.lotCount', 'Lots taken'), value: String(issue.lots.length) },
    { label: t('cc_production.issues.by', 'By'), value: issue.byName ?? '—' },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/resin/issues', label: t('cc_production.nav.chemicalIssues', 'Chemical issue') }}
        overline={t('cc_production.issues.overline', 'Chemical issue · {chemical}', { chemical: issue.productTitle })}
        title={`${day(issue.issueDate)} · ${kg(issue.kg)} kg`}
        badges={issue.status === 'cancelled' ? <StatusBadge variant="neutral">{t('cc_production.issues.cancelledBadge', 'Cancelled')}</StatusBadge> : <StatusBadge variant="success">{t('cc_production.issues.posted', 'Issued')}</StatusBadge>}
        meta={t('cc_production.issues.entered', 'Entered {at}', { at: when(issue.createdAt) })}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.print', 'Print')}
            </Button>
            {canIssue && issue.status === 'posted' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setCancelling(true)}>
                <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.issues.cancel', 'Cancel')}
              </Button>
            ) : null}
          </>
        }
        chain={issue.usedFor === 'coating' ? <PlantChain current="coating" hrefs={{ coating: issue.coatingSheet ? recordHref.coatingSheet(issue.coatingSheet.id) : null }} /> : undefined}
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel title={t('cc_production.issues.cameFrom', 'Came from · lots taken')} icon={Beaker} count={issue.lots.length} flush>
                <RegisterGrid
                  rows={issue.lots}
                  rowKey={(lot) => lot.lotId}
                  rowHref={(lot) => recordHref.lot(lot.lotId)}
                  empty={t('cc_production.issues.noLots', 'No lots recorded on this issue.')}
                  columns={[
                    { key: 'lot', label: t('cc_production.issues.lot', 'Lot No.'), mono: true, render: (lot) => lot.lotNumber ?? '—' },
                    { key: 'place', label: t('cc_production.issues.store', 'Store'), render: (lot) => PLACE_LABEL[lot.place as StockPlace] ?? lot.place },
                    {
                      key: 'grn',
                      label: t('cc_production.issues.grn', 'GRN'),
                      render: (lot) =>
                        lot.grnId ? (
                          <Link className="font-mono text-xs underline-offset-2 hover:underline" href={recordHref.grn(lot.grnId)}>
                            {lot.grnCode}
                          </Link>
                        ) : (
                          '—'
                        ),
                    },
                    { key: 'kg', label: 'kg', align: 'right', render: (lot) => kg(lot.kg), total: kg(issue.lots.reduce((sum, lot) => sum + lot.kg, 0)) },
                  ]}
                />
              </Panel>
              {issue.note ? (
                <Panel title={t('cc_production.issues.note', 'Note')}>
                  <p className="text-sm">{issue.note}</p>
                </Panel>
              ) : null}
            </>
          }
          side={
            <Panel title={t('cc_production.resin.wentTo', 'Went to')} icon={Waypoints} flush>
              {issue.usedFor === 'coating' ? (
                issue.coatingSheet ? (
                  <Link href={recordHref.coatingSheet(issue.coatingSheet.id)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                    <span>
                      <span className="block font-medium">{t('cc_production.issues.daySheet', 'Coating day sheet')}</span>
                      <span className="block text-xs text-muted-foreground">
                        {issue.coatingSheet.dryerCode} · {day(issue.coatingSheet.sheetDate)}
                      </span>
                    </span>
                    <StatusBadge variant={issue.coatingSheet.status === 'posted' ? 'success' : 'warning'}>{t(`cc_production.status.${issue.coatingSheet.status}`, issue.coatingSheet.status)}</StatusBadge>
                  </Link>
                ) : (
                  <PanelEmpty>{t('cc_production.issues.noSheet', 'No day sheet for {dryer} on this date yet.', { dryer: issue.dryerCode ?? '—' })}</PanelEmpty>
                )
              ) : (
                <PanelEmpty>{t('cc_production.issues.otherUse', 'Other use (see the note).')}</PanelEmpty>
              )}
            </Panel>
          }
        />
        <Timeline type="chemical_issue" id={issue.id} refreshKey={issue.history.length} />
      </RecordPage>

      <Dialog open={cancelling} onOpenChange={(open) => !open && setCancelling(false)}>
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
            <Button type="button" variant="outline" onClick={() => setCancelling(false)}>
              {t('cc_production.resin.cancel', 'Cancel')}
            </Button>
            <Button type="button" disabled={busy || !reason.trim()} onClick={() => void cancel()}>
              {t('cc_production.issues.confirmCancel', 'Cancel the issue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ChemicalIssuePage
