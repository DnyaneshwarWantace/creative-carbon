"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarCheck, FileClock, KanbanSquare, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../cc_departments/components/useGranted'
import { formatDate, formatQty } from '../../cc_orders/components/format'
import { TONE_DOT, useStages } from './pipeline/stageUi'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { CorrectionsPanel } from '../../cc_ui/components/CorrectionsPanel'

type FollowUp = { id: string; enquiryNo: string; partyName: string | null; subject: string; nextActionOn?: string | null; nextActionNote: string | null; ownerName: string | null }
type Dashboard = {
  today: string
  pipeline: Record<string, number>
  month: Record<string, number>
  openQuotes: Array<{ currency: string; total: number; count: number }>
  overdue: FollowUp[]
  dueToday: FollowUp[]
  expiring: Array<{ id: string; quoteNo: string; customerName: string; validUntil: string | null; status: string; currency: string; totalAmount: number }>
}

function Panel({ title, count, icon, tone, children }: { title: string; count: number; icon: React.ReactNode; tone?: 'error'; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 shadow-xs', tone === 'error' ? 'border-status-error-border' : 'border-border')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', count && tone === 'error' ? 'bg-status-error-bg text-status-error-text' : 'bg-muted text-muted-foreground')}>{count}</span>
      </h2>
      {children}
    </section>
  )
}

function FollowUpList({ rows, empty, overdue }: { rows: FollowUp[]; empty: string; overdue?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id}>
          <Link className="underline-offset-2 hover:underline" href={`/backend/crm/enquiries/${row.id}`}>
            <span className="font-mono text-xs">{row.enquiryNo}</span> · <span className="font-medium">{row.partyName ?? '—'}</span> · {row.subject}
          </Link>
          <span className={cn('block text-xs', overdue ? 'text-status-error-text' : 'text-muted-foreground')}>
            {[row.nextActionOn ? formatDate(row.nextActionOn) : null, row.nextActionNote, row.ownerName].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CrmHomePage() {
  const t = useT()
  const granted = useGranted()
  const [data, setData] = React.useState<Dashboard | null>(null)
  const { stages } = useStages()

  React.useEffect(() => {
    apiCall<Dashboard>('/api/cc_crm/dashboard').then((call) => setData(call.ok ? (call.ok ? (call.result ?? null) : null) : null))
  }, [])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t('cc_crm.home.title', 'CRM')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_crm.home.subtitle', 'Enquiries, follow-ups and quotations. Orders booked here are worked by Accounts, store, QC and despatch in the ERP.')}</p>
            </div>
            {granted.has('cc_crm.manage') ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/backend/crm/pipeline">
                    <KanbanSquare className="mr-1.5 h-4 w-4" />
                    {t('cc_crm.pipeline.open', 'Pipeline board')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/backend/crm/quotations/new">{t('cc_crm.quotations.new', 'New quotation')}</Link>
                </Button>
                <Button asChild>
                  <Link href="/backend/crm/enquiries/new">
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('cc_crm.enquiries.new', 'Log enquiry')}
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
          {!data ? (
            <PageLoading label={t('cc_crm.loading', 'Loading…')} />
          ) : (
            <>
              <section className="rounded-xl border bg-card p-4 shadow-xs">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t('cc_crm.home.pipeline', 'Pipeline')}</h2>
                  <Link href="/backend/crm/pipeline" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                    {t('cc_crm.home.openBoard', 'Open the board')}
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {(stages ?? []).map((stage, index) => (
                    <Link key={stage.key} href={`/backend/crm/enquiries?stage=${stage.key}`} className="group relative rounded-lg border border-border bg-background p-3 hover:border-primary">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[stage.tone] ?? TONE_DOT.neutral)} aria-hidden="true" />
                        <span className="truncate">{stage.kind === 'open' ? `${index + 1}. ` : ''}{stage.label}</span>
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums group-hover:text-primary">{data.pipeline[stage.key] ?? 0}</div>
                      {stage.kind !== 'open' ? <div className="text-xs text-muted-foreground">{t('cc_crm.home.thisMonth', '{count} this month', { count: data.month[stage.key] ?? 0 })}</div> : null}
                    </Link>
                  ))}
                  <Link href="/backend/crm/quotations" className="rounded-lg border border-border bg-background p-3 hover:border-primary">
                    <div className="text-xs text-muted-foreground">{t('cc_crm.home.openQuotes', 'Open quotations')}</div>
                    {data.openQuotes.length ? (
                      data.openQuotes.map((row) => (
                        <div key={row.currency} className="mt-1 text-sm font-semibold tabular-nums">
                          {row.currency} {formatQty(row.total, 0)} <span className="text-xs font-normal text-muted-foreground">({row.count})</span>
                        </div>
                      ))
                    ) : (
                      <div className="mt-1 text-2xl font-bold">0</div>
                    )}
                  </Link>
                </div>
              </section>
              <CorrectionsPanel scope="crm" />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Panel title={t('cc_crm.home.overdueTitle', 'Follow-ups overdue')} count={data.overdue.length} icon={<AlarmClock className="h-4 w-4" aria-hidden="true" />} tone={data.overdue.length ? 'error' : undefined}>
                  <FollowUpList rows={data.overdue} overdue empty={t('cc_crm.home.noOverdue', 'Nothing overdue.')} />
                </Panel>
                <Panel title={t('cc_crm.home.todayTitle', 'Follow-ups today')} count={data.dueToday.length} icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}>
                  <FollowUpList rows={data.dueToday} empty={t('cc_crm.home.noToday', 'No follow-ups today.')} />
                </Panel>
                <Panel title={t('cc_crm.home.expiringTitle', 'Quotations expiring in 7 days')} count={data.expiring.length} icon={<FileClock className="h-4 w-4" aria-hidden="true" />}>
                  {data.expiring.length ? (
                    <ul className="space-y-2 text-sm">
                      {data.expiring.map((row) => (
                        <li key={row.id}>
                          <Link className="underline-offset-2 hover:underline" href={`/backend/crm/quotations/${row.id}`}>
                            <span className="font-mono text-xs">{row.quoteNo}</span> · <span className="font-medium">{row.customerName}</span>
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(row.validUntil)} · {row.currency} {formatQty(row.totalAmount, 2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('cc_crm.home.noExpiring', 'None expiring this week.')}</p>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default CrmHomePage
