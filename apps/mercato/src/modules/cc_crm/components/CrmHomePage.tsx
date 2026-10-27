"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarCheck, ChevronRight, FileClock, KanbanSquare, Megaphone, Plus, Trophy, TrendingUp, Users } from 'lucide-react'
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
import { DashCard, DashHeader, EmptyLine, KpiStrip, MeterBar, MoreLink } from '../../cc_ui/components/DashKit'

type FollowUp = { id: string; enquiryNo: string; partyName: string | null; subject: string; nextActionOn?: string | null; nextActionNote: string | null; ownerName: string | null }
type Dashboard = {
  today: string
  pipeline: Record<string, number>
  month: Record<string, number>
  openQuotes: Array<{ currency: string; total: number; count: number }>
  overdue: FollowUp[]
  dueToday: FollowUp[]
  expiring: Array<{ id: string; quoteNo: string; customerName: string; validUntil: string | null; status: string; currency: string; totalAmount: number }>
  sources?: Array<{ source: string; total: number; won: number }>
  weeks?: Array<{ weekStart: string; total: number }>
  winRate?: { won: number; lost: number }
  owners?: Array<{ name: string | null; open: number; overdue: number; won: number }>
}

const TOP = 6

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function FollowUpList({ rows, overdue }: { rows: FollowUp[]; overdue?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id}>
          <Link className="-mx-2 block rounded-md px-2 py-2 transition-colors hover:bg-muted/50" href={`/backend/crm/enquiries/${row.id}`}>
            <span className="block truncate text-sm font-medium">{row.partyName ?? '—'}</span>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="font-mono">{row.enquiryNo}</span> · {row.subject}
            </span>
            <span className={cn('block truncate text-xs', overdue ? 'text-status-error-text' : 'text-muted-foreground')}>
              {[row.nextActionOn ? formatDate(row.nextActionOn) : null, row.nextActionNote, row.ownerName].filter(Boolean).join(' · ')}
            </span>
          </Link>
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
    apiCall<Dashboard>('/api/cc_crm/dashboard').then((call) => setData(call.ok ? (call.result ?? null) : null))
  }, [])

  const openStages = (stages ?? []).filter((stage) => stage.kind === 'open')
  const openTotal = openStages.reduce((sum, stage) => sum + (data?.pipeline[stage.key] ?? 0), 0)
  const won = data?.winRate?.won ?? 0
  const lost = data?.winRate?.lost ?? 0
  const winPct = won + lost ? Math.round((won / (won + lost)) * 100) : 0
  const weeks = data?.weeks ?? []
  const weekMax = Math.max(1, ...weeks.map((week) => week.total))
  const sources = data?.sources ?? []
  const sourceMax = Math.max(1, ...sources.map((row) => row.total))
  const owners = data?.owners ?? []
  const ownerMax = Math.max(1, ...owners.map((row) => row.open))
  const inr = data?.openQuotes.find((row) => row.currency === 'INR') ?? data?.openQuotes[0] ?? null

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 pb-16">
          <DashHeader
            overline={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            title={t('cc_crm.home.title', 'CRM')}
            lede={t('cc_crm.home.subtitle', 'Enquiries, follow-ups and quotations. Orders booked here are worked by Accounts, store, QC and despatch in the ERP.')}
            actions={
              granted.has('cc_crm.manage') ? (
                <>
                  <Button asChild variant="outline">
                    <Link href="/backend/crm/pipeline">
                      <KanbanSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_crm.pipeline.open', 'Pipeline board')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/backend/crm/quotations/new">{t('cc_crm.quotations.new', 'New quotation')}</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/backend/crm/enquiries/new">
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_crm.enquiries.new', 'Log enquiry')}
                    </Link>
                  </Button>
                </>
              ) : null
            }
          />

          {!data ? (
            <PageLoading label={t('cc_crm.loading', 'Loading…')} />
          ) : (
            <>
              <KpiStrip
                items={[
                  { label: t('cc_crm.home.kpiOpen', 'Open enquiries'), value: openTotal, href: '/backend/crm/enquiries' },
                  { label: t('cc_crm.home.overdueTitle', 'Follow-ups overdue'), value: data.overdue.length, tone: data.overdue.length ? 'bad' : 'good', href: '/backend/crm/follow-ups' },
                  { label: t('cc_crm.home.todayTitle', 'Follow-ups today'), value: data.dueToday.length, href: '/backend/crm/follow-ups' },
                  { label: t('cc_crm.home.kpiWon', 'Won this month'), value: data.month.won ?? 0, tone: data.month.won ? 'good' : undefined, href: '/backend/crm/enquiries?stage=won' },
                  {
                    label: t('cc_crm.home.openQuotes', 'Open quotations'),
                    value: inr ? `${inr.currency === 'INR' ? '₹' : `${inr.currency} `}${formatQty(inr.total, 0)}` : 0,
                    hint: data.openQuotes.map((row) => t('cc_crm.home.quoteCount', '{count} in {currency}', { count: row.count, currency: row.currency })).join(' · ') || undefined,
                    href: '/backend/crm/quotations',
                  },
                ]}
              />

              <DashCard
                title={t('cc_crm.home.pipeline', 'Pipeline')}
                icon={KanbanSquare}
                count={openTotal}
                action={
                  <Link href="/backend/crm/pipeline" className="font-medium text-primary hover:underline">
                    {t('cc_crm.home.openBoard', 'Open the board')}
                  </Link>
                }
              >
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {(stages ?? []).map((stage, index, list) => (
                    <li key={stage.key} className="relative">
                      <Link href={`/backend/crm/enquiries?stage=${stage.key}`} className="flex h-full flex-col rounded-lg border border-border bg-background p-3 transition-colors hover:border-foreground/40">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[stage.tone] ?? TONE_DOT.neutral)} aria-hidden="true" />
                          <span className="truncate">{stage.label}</span>
                        </span>
                        <span className="cc-figure mt-2 text-3xl">{data.pipeline[stage.key] ?? 0}</span>
                        <span className="mt-1 text-xs text-muted-foreground">
                          {stage.kind === 'open' ? t('cc_crm.home.stepNo', 'step {no}', { no: index + 1 }) : t('cc_crm.home.thisMonth', '{count} this month', { count: data.month[stage.key] ?? 0 })}
                        </span>
                      </Link>
                      {index < list.length - 1 && stage.kind === 'open' ? <ChevronRight className="absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground xl:block" aria-hidden="true" /> : null}
                    </li>
                  ))}
                </ol>
              </DashCard>

              <div className="cc-masonry">
                <DashCard title={t('cc_crm.home.overdueTitle', 'Follow-ups overdue')} icon={AlarmClock} count={data.overdue.length} tone={data.overdue.length ? 'bad' : undefined}>
                  {data.overdue.length ? <FollowUpList rows={data.overdue.slice(0, TOP)} overdue /> : <EmptyLine text={t('cc_crm.home.noOverdue', 'Nothing overdue.')} />}
                  {data.overdue.length > TOP ? <MoreLink href="/backend/crm/follow-ups" label={t('cc_crm.home.allFollowUps', 'All follow-ups')} /> : null}
                </DashCard>

                <DashCard title={t('cc_crm.home.winRate', 'Win rate, last 90 days')} icon={Trophy}>
                  <div className="flex items-center gap-4">
                    <div className="cc-ring shrink-0" style={{ ['--pct' as string]: winPct }} aria-label={t('cc_crm.home.winPct', '{pct}% won', { pct: winPct })}>
                      <span>{winPct}%</span>
                    </div>
                    <dl className="grid flex-1 grid-cols-2 gap-2 text-center">
                      <div className="rounded-md bg-status-success-bg px-2 py-2">
                        <dt className="text-xs text-muted-foreground">{t('cc_crm.home.won', 'Won')}</dt>
                        <dd className="cc-figure text-xl text-status-success-text">{won}</dd>
                      </div>
                      <div className="rounded-md bg-muted px-2 py-2">
                        <dt className="text-xs text-muted-foreground">{t('cc_crm.home.lost', 'Lost')}</dt>
                        <dd className="cc-figure text-xl">{lost}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t('cc_crm.home.winHint', 'Of the enquiries closed in the last 90 days, how many became orders.')}</p>
                </DashCard>

                <DashCard title={t('cc_crm.home.todayTitle', 'Follow-ups today')} icon={CalendarCheck} count={data.dueToday.length}>
                  {data.dueToday.length ? <FollowUpList rows={data.dueToday.slice(0, TOP)} /> : <EmptyLine text={t('cc_crm.home.noToday', 'No follow-ups today.')} />}
                  {data.dueToday.length > TOP ? <MoreLink href="/backend/crm/follow-ups" label={t('cc_crm.home.allFollowUps', 'All follow-ups')} /> : null}
                </DashCard>

                <DashCard title={t('cc_crm.home.weeks', 'New enquiries per week')} icon={TrendingUp} count={weeks.reduce((sum, week) => sum + week.total, 0)}>
                  <div className="grid text-center text-xs font-semibold tabular-nums" style={{ gridTemplateColumns: `repeat(${weeks.length || 1}, minmax(0, 1fr))` }}>
                    {weeks.map((week) => (
                      <span key={week.weekStart} className={cn(!week.total && 'text-transparent')}>
                        {week.total}
                      </span>
                    ))}
                  </div>
                  <div className="cc-spark mt-1">
                    {weeks.map((week, index) => (
                      <span key={week.weekStart} data-today={index === weeks.length - 1} style={{ height: `${Math.max(3, Math.round((week.total / weekMax) * 100))}%` }} title={`${shortDay(week.weekStart)} · ${week.total}`} />
                    ))}
                  </div>
                  <div className="mt-1 grid text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${weeks.length || 1}, minmax(0, 1fr))` }}>
                    {weeks.map((week, index) => (
                      <span key={week.weekStart} className={cn(index === weeks.length - 1 && 'font-semibold text-foreground')}>
                        {index === weeks.length - 1 ? t('cc_crm.home.thisWeek', 'now') : shortDay(week.weekStart)}
                      </span>
                    ))}
                  </div>
                </DashCard>

                <DashCard title={t('cc_crm.home.sources', 'Where enquiries come from')} icon={Megaphone} count={sources.reduce((sum, row) => sum + row.total, 0)}>
                  {sources.length ? (
                    <ul className="space-y-2.5">
                      {sources.map((row) => (
                        <li key={row.source}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{row.source}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              <b className="text-foreground">{row.total}</b>
                              {row.won ? <span className="text-status-success-text"> · {t('cc_crm.home.wonCount', '{count} won', { count: row.won })}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1">
                            <MeterBar value={row.total} max={sourceMax} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine text={t('cc_crm.home.noSources', 'No enquiries in the last 90 days.')} />
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">{t('cc_crm.home.sourcesHint', 'Last 90 days')}</p>
                </DashCard>

                <DashCard title={t('cc_crm.home.expiringTitle', 'Quotations expiring in 7 days')} icon={FileClock} count={data.expiring.length} tone={data.expiring.length ? 'warn' : undefined}>
                  {data.expiring.length ? (
                    <ul className="divide-y divide-border">
                      {data.expiring.slice(0, TOP).map((row) => (
                        <li key={row.id}>
                          <Link className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50" href={`/backend/crm/quotations/${row.id}`}>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{row.customerName || '—'}</span>
                              <span className="block truncate font-mono text-xs text-muted-foreground">{row.quoteNo}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs tabular-nums">
                              <span className="block font-semibold">
                                {row.currency} {formatQty(row.totalAmount, 0)}
                              </span>
                              <span className="block text-status-warning-text">{t('cc_crm.home.validTill', 'till {date}', { date: formatDate(row.validUntil) })}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine text={t('cc_crm.home.noExpiring', 'None expiring this week.')} />
                  )}
                  {data.expiring.length > TOP ? <MoreLink href="/backend/crm/quotations" label={t('cc_crm.home.allQuotes', 'All quotations')} /> : null}
                </DashCard>

                <DashCard title={t('cc_crm.home.owners', 'Salespeople')} icon={Users} count={owners.length}>
                  {owners.length ? (
                    <ul className="space-y-3">
                      {owners.slice(0, TOP).map((row) => (
                        <li key={row.name ?? 'none'}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">{(row.name ?? '?').slice(0, 2)}</span>
                              <span className={cn('truncate text-sm font-medium', !row.name && 'italic text-muted-foreground')}>{row.name ?? t('cc_crm.home.noOwner', 'Not assigned')}</span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {t('cc_crm.home.ownerOpen', '{count} open', { count: row.open })}
                              {row.overdue ? <span className="text-status-error-text"> · {t('cc_crm.home.ownerOverdue', '{count} overdue', { count: row.overdue })}</span> : null}
                              {row.won ? <span className="text-status-success-text"> · {t('cc_crm.home.wonCount', '{count} won', { count: row.won })}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <MeterBar value={row.open} max={ownerMax} tone={row.overdue ? 'warn' : 'accent'} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine text={t('cc_crm.home.noOwners', 'No open enquiries.')} />
                  )}
                  {granted.has('cc_crm.team') ? <MoreLink href="/backend/crm/team" label={t('cc_crm.home.team', 'Team & access')} /> : null}
                </DashCard>

                <CorrectionsPanel scope="crm" />
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default CrmHomePage
