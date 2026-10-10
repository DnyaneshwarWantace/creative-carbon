"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { ArrowRight, CalendarClock, CheckCircle2, PauseCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { downloadCsv } from '../../cc_products/lib/csvExport'

type WorkItem = {
  orderId: string
  orderNo: string
  customerName: string
  stageKey: string
  stageLabel: string
  department: string
  status: string
  days: number
  stuck: boolean
  holdParty: string | null
  holdReason: string | null
  deliveryDate: string | null
  overdue: boolean
  responsibleName: string | null
  href: string
}

function shortDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function Row({ item, showPerson }: { item: WorkItem; showPerson: boolean }) {
  const t = useT()
  return (
    <li>
      <Link href={item.href} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
        <div className="flex min-w-0 items-center gap-3 md:col-span-4">
          <span
            className={cn(
              'h-10 w-1 shrink-0 rounded-full',
              item.status === 'on_hold' ? 'bg-status-error-icon' : item.overdue || item.stuck ? 'bg-status-warning-icon' : 'bg-accent-indigo',
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold">{item.orderNo}</p>
            <p className="truncate text-xs text-muted-foreground">{item.customerName}</p>
          </div>
        </div>
        <div className="min-w-0 md:col-span-4">
          <p className="truncate text-sm font-medium">{item.stageLabel}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.department}
            {showPerson ? ` · ${item.responsibleName ?? t('cc_dashboard.unassigned', 'Not assigned')}` : ''}
          </p>
          {item.status === 'on_hold' ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-status-error-text">
              <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {item.holdParty ?? '—'}: {item.holdReason ?? ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 md:col-span-4 md:justify-end">
          {item.deliveryDate ? (
            <span className={cn('inline-flex items-center gap-1 text-xs', item.overdue ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {item.overdue ? t('cc_dashboard.wasDue', 'was due {date}', { date: shortDate(item.deliveryDate) }) : t('cc_dashboard.dueShort', 'due {date}', { date: shortDate(item.deliveryDate) })}
            </span>
          ) : null}
          <span className={cn('rounded-sm px-2 py-0.5 text-xs font-semibold tabular-nums', item.stuck ? 'bg-status-warning-bg text-status-warning-text' : 'bg-muted text-muted-foreground')}>
            {item.days === 0 ? t('cc_dashboard.today', 'today') : t('cc_dashboard.daysWaiting', '{days} d waiting', { days: item.days })}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </Link>
    </li>
  )
}

type FollowUpRow = { id: string; kindLabel: string; dueOn: string; overdue: boolean; partyName: string | null; enquiryNo: string | null; note: string | null; ownerName: string | null }

function MyFollowUps({ everyone }: { everyone: boolean }) {
  const t = useT()
  const [rows, setRows] = React.useState<FollowUpRow[] | null>(null)
  React.useEffect(() => {
    setRows(null)
    void apiCall<{ items: FollowUpRow[] }>(`/api/cc_crm/follow-ups?view=${everyone ? 'all' : 'mine'}&status=open`, undefined, { fallback: { items: [] } }).then((call) => setRows(call.result?.items ?? []))
  }, [everyone])
  if (!rows?.length) return null
  const due = rows.filter((row) => row.dueOn <= new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10))
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('cc_dashboard.my.followUps', 'Follow-ups due · {count}', { count: due.length })}</h2>
        <Link href="/backend/crm/follow-ups" className="text-xs text-primary hover:underline">
          {t('cc_dashboard.my.allFollowUps', 'All follow-ups')}
        </Link>
      </header>
      <ul className="divide-y divide-border">
        {(due.length ? due : rows.slice(0, 5)).map((row) => (
          <li key={row.id}>
            <Link href={`/backend/crm/follow-ups/${row.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{[row.kindLabel, row.partyName].filter(Boolean).join(' · ')}</span>
                <span className="block truncate text-xs text-muted-foreground">{[row.enquiryNo, row.note, everyone ? row.ownerName : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={cn('shrink-0 font-mono text-xs tabular-nums', row.overdue && 'font-semibold text-status-error-text')}>{row.dueOn}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MyWorkPage() {
  const t = useT()
  const [scope, setScope] = React.useState<'mine' | 'everyone'>('mine')
  const granted = useGranted()
  const canSeeEveryone = granted.has('cc_dashboard.everyone')
  const [items, setItems] = React.useState<WorkItem[] | null>(null)

  React.useEffect(() => {
    setItems(null)
    apiCall<{ items: WorkItem[] }>(scope === 'mine' ? '/api/cc_dashboard/my-work' : '/api/cc_dashboard/team-work', undefined, { fallback: { items: [] } }).then((call) => setItems(call.result?.items ?? []))
  }, [scope])

  const urgent = (items ?? []).filter((item) => item.overdue || item.stuck)
  const rest = (items ?? []).filter((item) => !item.overdue && !item.stuck)

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
              </p>
              <h1 className="text-2xl font-bold tracking-tight">{scope === 'mine' ? t('cc_dashboard.my.title', 'My pending work') : t('cc_dashboard.team.title', "Everyone's pending work")}</h1>
              <p className="text-sm text-muted-foreground">
                {t('cc_dashboard.my.lede', 'The order steps you are responsible for. The same list is emailed every morning.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canSeeEveryone ? (
                <SegmentedControl value={scope} onValueChange={(value) => setScope(value as typeof scope)} aria-label={t('cc_dashboard.my.scope', 'Whose work')}>
                  <SegmentedControlItem value="mine">{t('cc_dashboard.my.mine', 'Mine')}</SegmentedControlItem>
                  <SegmentedControlItem value="everyone">{t('cc_dashboard.my.everyone', 'Everyone')}</SegmentedControlItem>
                </SegmentedControl>
              ) : null}
              <ExportButton
                disabled={!items?.length}
                onExport={() =>
                  downloadCsv(scope === 'mine' ? 'my-pending-work' : 'team-pending-work', [
                    { header: 'Order', value: (item) => item.orderNo },
                    { header: 'Customer', value: (item) => item.customerName },
                    { header: 'Stage', value: (item) => item.stageLabel },
                    { header: 'Department', value: (item) => item.department },
                    { header: 'Responsible', value: (item) => item.responsibleName ?? '' },
                    { header: 'Status', value: (item) => (item.status === 'on_hold' ? 'On hold' : 'In progress') },
                    { header: 'On hold with', value: (item) => item.holdParty ?? '' },
                    { header: 'Hold reason', value: (item) => item.holdReason ?? '' },
                    { header: 'Days waiting', value: (item) => item.days },
                    { header: 'Stuck', value: (item) => (item.stuck ? 'Yes' : '') },
                    { header: 'Delivery', value: (item) => item.deliveryDate ?? '' },
                    { header: 'Late', value: (item) => (item.overdue ? 'Yes' : '') },
                  ], items ?? [])
                }
              />
            </div>
          </header>

          {granted.has('cc_crm.view') ? <MyFollowUps everyone={scope === 'everyone'} /> : null}

          {!items ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !items.length ? (
            <EmptyState
              className="py-20"
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              title={t('cc_dashboard.my.empty', 'Nothing pending')}
              description={t('cc_dashboard.my.emptyHint', 'No open order step is assigned to you. Steps are assigned on the order page.')}
            />
          ) : (
            <>
              {urgent.length ? (
                <section className="overflow-hidden rounded-xl border border-status-warning-border bg-card shadow-sm">
                  <header className="border-b border-border bg-status-warning-bg px-5 py-3">
                    <h2 className="text-sm font-semibold text-status-warning-text">
                      {t('cc_dashboard.my.urgent', 'Late, stuck or on hold · {count}', { count: urgent.length })}
                    </h2>
                  </header>
                  <ul className="divide-y divide-border">
                    {urgent.map((item) => (
                      <Row key={`${item.orderId}-${item.stageKey}`} item={item} showPerson={scope === 'everyone'} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {rest.length ? (
                <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <header className="border-b border-border px-5 py-3">
                    <h2 className="text-sm font-semibold">{t('cc_dashboard.my.onTrack', 'On track · {count}', { count: rest.length })}</h2>
                  </header>
                  <ul className="divide-y divide-border">
                    {rest.map((item) => (
                      <Row key={`${item.orderId}-${item.stageKey}`} item={item} showPerson={scope === 'everyone'} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default MyWorkPage
