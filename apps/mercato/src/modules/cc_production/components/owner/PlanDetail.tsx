"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardList, Factory, History, PencilLine, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { Comments } from '../../../cc_ui/components/Comments'
import { Timeline } from '../../../cc_ui/components/Timeline'
import { recordHref } from '../../../cc_ui/lib/links'
import { day, kg, when } from '../resin/shared'

type Area = 'resin' | 'coating' | 'press' | 'moulding'
type PlanRow = { area: Area; resource: string; item: string | null; plannedQty: number; unit: string; note: string | null; actual: number; pct: number | null }
type Version = { version: number; lines: Array<{ area: Area; resource: string; item: string | null; plannedQty: number; unit: string }>; notes: string | null; byName: string | null; savedAt: string; replacedAt: string; replacedByName: string | null; reason: string | null }
type Made = { type: string; id: string; label: string; area: Area; qty: number; unit: string }
type PlanDetailView = {
  id: string | null
  planDate: string
  status: 'closed' | 'today' | 'ahead'
  notes: string | null
  byName: string | null
  updatedAt: string | null
  rows: PlanRow[]
  versionList: Version[]
  made: Made[]
  ordersDue: Array<{ id: string; orderNo: string; status: string; deliveryDate: string }>
}

const AREA_LABEL: Record<Area, string> = { resin: 'Resin', coating: 'Coating', press: 'Press', moulding: 'Moulding' }
const MADE_PATH: Record<string, string> = {
  resin_batch: '/backend/resin/batches/',
  coating_sheet: '/backend/coating/',
  press_batch: '/backend/press/batches/',
  moulding_entry: '/backend/moulding/entries/',
}

function amount(value: number, unit: string): string {
  return unit === 'kg' ? `${kg(value)} kg` : `${value} ${unit}`
}

export function PlanDetailPage({ planKey }: { planKey: string }) {
  const t = useT()
  const granted = useGranted()
  const [plan, setPlan] = React.useState<PlanDetailView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<PlanDetailView>(`/api/cc_production/plan?key=${encodeURIComponent(planKey)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.plan.loadError', 'Could not load this plan.'))
      else setPlan(call.result)
    })
  }, [planKey, t])
  if (error || !plan) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const areas = (['resin', 'coating', 'press', 'moulding'] as Area[]).filter((area) => plan.rows.some((row) => row.area === area))
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(plan.planDate) },
    ...areas.map((area) => {
      const rows = plan.rows.filter((row) => row.area === area)
      const planned = rows.reduce((sum, row) => sum + row.plannedQty, 0)
      const actual = rows.reduce((sum, row) => sum + row.actual, 0)
      const unit = rows[0]?.unit ?? 'kg'
      const pct = planned ? Math.round((actual / planned) * 100) : null
      return { label: AREA_LABEL[area], value: `${amount(actual, unit)} / ${amount(planned, unit)}`, hint: pct === null ? undefined : `${pct}%`, tone: pct === null ? undefined : pct >= 90 ? ('good' as const) : pct >= 60 ? ('warn' as const) : ('bad' as const) }
    }),
  ]
  const canChange = granted.has('cc_production.plan.manage') && plan.status !== 'closed'
  const statusBadge =
    plan.status === 'closed' ? (
      <StatusBadge variant="neutral">{t('cc_production.plan.closed', 'Day over')}</StatusBadge>
    ) : plan.status === 'today' ? (
      <StatusBadge variant="info">{t('cc_production.plan.today', 'Today')}</StatusBadge>
    ) : (
      <StatusBadge variant="success">{t('cc_production.plan.ahead', 'Planned ahead')}</StatusBadge>
    )

  return (
    <RecordPage
      back={{ href: `/backend/owner?date=${plan.planDate}`, label: t('cc_production.owner.title', 'Plant today') }}
      overline={t('cc_production.plan.overline', 'Production plan')}
      title={day(plan.planDate)}
      mono={false}
      badges={
        <>
          {statusBadge}
          {plan.versionList.length ? <StatusBadge variant="neutral">{t('cc_production.plan.changedTimes', 'Changed {count}×', { count: plan.versionList.length })}</StatusBadge> : null}
        </>
      }
      meta={plan.byName ? t('cc_production.plan.by', 'Written by {name}', { name: plan.byName }) : t('cc_production.plan.none', 'No plan written for this day')}
      actions={
        canChange ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/backend/owner/plan?date=${plan.planDate}`}>
              <PencilLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {plan.id ? t('cc_production.plan.change', 'Change plan') : t('cc_production.plan.write', 'Write plan')}
            </Link>
          </Button>
        ) : null
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.plan.lines', 'Planned against made')} icon={ClipboardList} count={plan.rows.length} flush>
              <RegisterGrid
                rows={plan.rows}
                rowKey={(row) => `${row.area}-${row.resource}-${row.item ?? ''}`}
                empty={t('cc_production.plan.noLines', 'Nothing planned.')}
                columns={[
                  { key: 'area', label: t('cc_production.plan.area', 'Area'), render: (row) => AREA_LABEL[row.area] },
                  { key: 'resource', label: t('cc_production.plan.resource', 'Machine / dryer'), render: (row) => row.resource || '—' },
                  { key: 'item', label: t('cc_production.plan.item', 'Item / die'), render: (row) => row.item ?? '—' },
                  { key: 'planned', label: t('cc_production.plan.planned', 'Planned'), align: 'right', render: (row) => amount(row.plannedQty, row.unit) },
                  { key: 'actual', label: t('cc_production.plan.actual', 'Made'), align: 'right', render: (row) => amount(row.actual, row.unit) },
                  { key: 'pct', label: '%', align: 'right', render: (row) => (row.pct === null ? '—' : `${row.pct}%`) },
                ]}
              />
              {plan.notes ? <p className="border-t border-border px-3 py-2 text-sm">{plan.notes}</p> : null}
            </Panel>
            <Panel title={t('cc_production.plan.made', 'Made that day')} icon={Factory} count={plan.made.length} flush>
              <LinkRows
                empty={t('cc_production.plan.nothingMade', 'Nothing posted for this day yet.')}
                rows={plan.made.map((entry) => ({ key: `${entry.type}-${entry.id}`, href: `${MADE_PATH[entry.type]}${entry.id}`, primary: entry.label, secondary: `${AREA_LABEL[entry.area]} · ${amount(entry.qty, entry.unit)}` }))}
              />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={t('cc_production.plan.ordersDue', 'Orders due in the next 7 days')} icon={Truck} count={plan.ordersDue.length} flush>
              <LinkRows
                empty={t('cc_production.plan.noOrders', 'No open orders due.')}
                rows={plan.ordersDue.map((order) => ({ key: order.id, href: recordHref.order(order.id), primary: order.orderNo, secondary: day(order.deliveryDate) }))}
              />
            </Panel>
            <Panel title={t('cc_production.plan.versions', 'Earlier versions')} icon={History} count={plan.versionList.length}>
              {plan.versionList.length ? (
                <ol className="space-y-3 text-sm">
                  {[...plan.versionList].reverse().map((version) => (
                    <li key={version.version} className="space-y-1">
                      <p className="font-medium">
                        {t('cc_production.plan.versionNo', 'Version {no}', { no: version.version })}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{t('cc_production.plan.replaced', 'replaced {when} by {name}', { when: when(version.replacedAt), name: version.replacedByName ?? '—' })}</span>
                      </p>
                      {version.reason ? <p className="text-xs text-muted-foreground">{version.reason}</p> : null}
                      <ul className="list-disc pl-5 text-xs text-muted-foreground">
                        {version.lines.map((line, index) => (
                          <li key={index}>{[AREA_LABEL[line.area], line.resource, line.item, amount(line.plannedQty, line.unit)].filter(Boolean).join(' · ')}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t('cc_production.plan.noVersions', 'Not changed since it was written.')}</p>
              )}
            </Panel>
          </>
        }
      />
      {plan.id ? <Comments type="plan" id={plan.id} /> : null}
      {plan.id ? <Timeline type="plan" id={plan.id} refreshKey={plan.updatedAt} /> : null}
    </RecordPage>
  )
}
