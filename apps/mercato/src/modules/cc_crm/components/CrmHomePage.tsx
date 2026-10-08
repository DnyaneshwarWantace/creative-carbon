"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarCheck, FileClock, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../cc_departments/components/useGranted'
import { formatDate, formatQty } from '../../cc_orders/components/format'
import { STAGE_LABEL, type EnquiryStage } from './types'
import { PageLoading } from '../../cc_ui/components/PageLoading'

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

const PIPELINE: EnquiryStage[] = ['new', 'quoted', 'negotiating', 'won', 'lost']

function Panel({ title, icon, tone, children }: { title: string; icon: React.ReactNode; tone?: 'error'; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 shadow-xs', tone === 'error' ? 'border-status-error-border' : 'border-border')}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {icon}
        {title}
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
              <div className="flex gap-2">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {PIPELINE.map((stage) => (
                  <Link key={stage} href={`/backend/crm/enquiries?stage=${stage}`} className="rounded-xl border bg-card p-4 shadow-xs hover:bg-accent/40">
                    <div className="text-xs text-muted-foreground">{t(`cc_crm.stage.${stage}`, STAGE_LABEL[stage])}</div>
                    <div className="text-2xl font-bold tabular-nums">{data.pipeline[stage] ?? 0}</div>
                    {stage === 'won' || stage === 'lost' ? <div className="text-xs text-muted-foreground">{t('cc_crm.home.thisMonth', '{count} this month', { count: data.month[stage] ?? 0 })}</div> : null}
                  </Link>
                ))}
                <Link href="/backend/crm/quotations" className="rounded-xl border bg-card p-4 shadow-xs hover:bg-accent/40">
                  <div className="text-xs text-muted-foreground">{t('cc_crm.home.openQuotes', 'Open quotations')}</div>
                  {data.openQuotes.length ? (
                    data.openQuotes.map((row) => (
                      <div key={row.currency} className="text-sm font-semibold tabular-nums">
                        {row.currency} {formatQty(row.total, 0)} <span className="text-xs font-normal text-muted-foreground">({row.count})</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-2xl font-bold">0</div>
                  )}
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Panel title={t('cc_crm.home.overdue', 'Follow-ups overdue ({count})', { count: data.overdue.length })} icon={<AlarmClock className="h-4 w-4" aria-hidden="true" />} tone={data.overdue.length ? 'error' : undefined}>
                  <FollowUpList rows={data.overdue} overdue empty={t('cc_crm.home.noOverdue', 'Nothing overdue.')} />
                </Panel>
                <Panel title={t('cc_crm.home.today', 'Follow-ups today ({count})', { count: data.dueToday.length })} icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}>
                  <FollowUpList rows={data.dueToday} empty={t('cc_crm.home.noToday', 'No follow-ups today.')} />
                </Panel>
                <Panel title={t('cc_crm.home.expiring', 'Quotations expiring in 7 days ({count})', { count: data.expiring.length })} icon={<FileClock className="h-4 w-4" aria-hidden="true" />}>
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
