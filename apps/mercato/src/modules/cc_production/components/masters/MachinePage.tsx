"use client"

import * as React from 'react'
import { Factory, History } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FieldList, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, formatCount, formatDay, formatKg, type Fact } from '../../../cc_ui/components/RecordPage'
import { recordHref, type MachineKind } from '../../../cc_ui/lib/links'

type WorkRow = { id: string; kind: 'resin' | 'coating' | 'press' | 'moulding'; date: string; label: string; detail: string | null; status: string; inputKg: number | null; outputKg: number | null; pieces: number | null; overCapacity: boolean }

type MachineView = {
  kind: MachineKind
  id: string
  code: string
  title: string
  isActive: boolean
  isWorking: boolean | null
  capacityKg: number | null
  notes: string | null
  dryerKind?: 'dryer' | 'mixer'
  pressType?: 'small' | 'big'
  usage?: 'laminate' | 'moulding' | 'both'
  daylights?: number | null
  days: number
  work: WorkRow[]
  figures: { runsThisMonth: number; kgThisMonth: number; piecesThisMonth: number; lastRun: string | null; drafts: number; overCapacity: number }
}

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = { draft: 'warning', posted: 'success', failed: 'error', cancelled: 'neutral' }
const KINDS = new Set<MachineKind>(['reactor', 'dryer', 'press'])

function workHref(row: WorkRow): string {
  if (row.kind === 'resin') return recordHref.resinBatch(row.id)
  if (row.kind === 'coating') return recordHref.coatingSheet(row.id)
  if (row.kind === 'press') return recordHref.pressBatch(row.id)
  return recordHref.mouldingEntry(row.id)
}

export function MachinePage({ kind, machineId }: { kind: string; machineId: string }) {
  const t = useT()
  const [machine, setMachine] = React.useState<MachineView | null>(null)
  const [error, setError] = React.useState<string | null>(KINDS.has(kind as MachineKind) ? null : t('cc_production.machine.unknown', 'Unknown machine type.'))

  React.useEffect(() => {
    if (!KINDS.has(kind as MachineKind)) return
    void apiCall<MachineView>(`/api/cc_production/records/machine?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(machineId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.machine.loadError', 'Could not load this machine.'))
      else setMachine(call.result)
    })
  }, [kind, machineId, t])

  if (error || !machine) return <RecordState error={error} loadingLabel={t('cc_production.machine.loading', 'Loading machine…')} />

  const kindLabel: Record<MachineKind, string> = {
    reactor: t('cc_production.machine.reactor', 'Reactor'),
    dryer: machine.dryerKind === 'mixer' ? t('cc_production.machine.mixer', 'Mixer oven') : t('cc_production.machine.dryer', 'Dryer'),
    press: t('cc_production.machine.press', 'Press'),
  }
  const workLabel: Record<WorkRow['kind'], string> = {
    resin: t('cc_production.machine.work.resin', 'Resin batch'),
    coating: t('cc_production.machine.work.coating', 'Coating day sheet'),
    press: t('cc_production.machine.work.press', 'Press batch'),
    moulding: t('cc_production.machine.work.moulding', 'Moulding entry'),
  }
  const showPieces = machine.kind !== 'reactor'
  const showInput = machine.kind !== 'press'
  const facts: Fact[] = [
    { label: t('cc_production.machine.monthRuns', 'Runs this month'), value: formatCount(machine.figures.runsThisMonth) },
    { label: t('cc_production.machine.monthKg', 'Output this month'), value: `${formatKg(machine.figures.kgThisMonth)} kg` },
    ...(showPieces ? [{ label: machine.kind === 'press' ? t('cc_production.machine.monthNos', 'Sheets / pieces this month') : t('cc_production.machine.monthCoated', 'Coated nos this month'), value: formatCount(machine.figures.piecesThisMonth) }] : []),
    { label: t('cc_production.machine.lastRun', 'Last run'), value: formatDay(machine.figures.lastRun) },
    { label: t('cc_production.machine.drafts', 'Not posted'), value: formatCount(machine.figures.drafts), tone: machine.figures.drafts ? 'warn' : undefined },
    ...(machine.kind === 'reactor' ? [{ label: t('cc_production.machine.overCapacity', 'Over capacity'), value: formatCount(machine.figures.overCapacity), tone: machine.figures.overCapacity ? ('bad' as const) : undefined }] : []),
  ]
  const working = machine.isWorking === false ? <StatusBadge variant="error">{t('cc_production.machine.notWorking', 'Not working')}</StatusBadge> : null

  return (
    <RecordPage
      back={{ href: '/backend/masters/plant', label: t('cc_production.nav.plant', 'Plant machines') }}
      overline={kindLabel[machine.kind]}
      title={machine.kind === 'press' ? `${kindLabel.press} ${machine.title}` : machine.title}
      badges={
        <>
          {machine.isActive ? <StatusBadge variant="success">{t('cc_production.machine.active', 'Active')}</StatusBadge> : <StatusBadge variant="neutral">{t('cc_production.machine.inactive', 'Inactive')}</StatusBadge>}
          {working}
        </>
      }
      meta={t('cc_production.machine.window', 'Work in the last {days} days', { days: machine.days })}
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.machine.work', 'Work on this machine')} icon={History} count={machine.work.length} flush>
            <RegisterGrid
              rows={machine.work}
              rowKey={(row) => `${row.kind}-${row.id}`}
              rowHref={workHref}
              empty={t('cc_production.machine.noWork', 'Nothing entered on this machine in the last {days} days.', { days: machine.days })}
              columns={[
                { key: 'no', label: t('cc_production.machine.number', 'No.'), mono: true, render: (row) => row.label },
                { key: 'date', label: t('cc_production.machine.date', 'Date'), render: (row) => formatDay(row.date) },
                { key: 'kind', label: t('cc_production.machine.register', 'Register'), render: (row) => workLabel[row.kind] },
                { key: 'detail', label: t('cc_production.machine.detail', 'Grade / customer'), render: (row) => row.detail ?? '—' },
                {
                  key: 'status',
                  label: t('cc_production.machine.status', 'Status'),
                  render: (row) => (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusBadge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{t(`cc_production.status.${row.status}`, row.status)}</StatusBadge>
                      {row.overCapacity ? <StatusBadge variant="error">{t('cc_production.machine.overShort', 'Over capacity')}</StatusBadge> : null}
                    </span>
                  ),
                },
                ...(showInput ? [{ key: 'in', label: t('cc_production.machine.inKg', 'In kg'), align: 'right' as const, render: (row: WorkRow) => formatKg(row.inputKg) }] : []),
                ...(showPieces ? [{ key: 'nos', label: t('cc_production.machine.nos', 'Nos'), align: 'right' as const, render: (row: WorkRow) => formatCount(row.pieces) }] : []),
                { key: 'out', label: t('cc_production.machine.outKg', 'Out kg'), align: 'right', render: (row) => formatKg(row.outputKg), total: formatKg(machine.work.filter((row) => row.status === 'posted').reduce((sum, row) => sum + (row.outputKg ?? 0), 0)) },
              ]}
            />
          </Panel>
        }
        side={
          <Panel title={t('cc_production.machine.details', 'Machine details')} icon={Factory}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_production.machine.code', 'Code / number'), machine.code],
                [t('cc_production.machine.type', 'Type'), kindLabel[machine.kind]],
                ...(machine.kind === 'reactor' ? [[t('cc_production.machine.capacity', 'Capacity'), machine.capacityKg !== null ? `${formatKg(machine.capacityKg)} kg` : null] as [string, React.ReactNode]] : []),
                ...(machine.kind === 'press'
                  ? ([
                      [t('cc_production.machine.size', 'Size'), machine.pressType === 'big' ? t('cc_production.machine.big', 'Big') : t('cc_production.machine.small', 'Small')],
                      [t('cc_production.machine.usage', 'Used for'), machine.usage ? t(`cc_production.machine.usage.${machine.usage}`, machine.usage) : null],
                      [t('cc_production.machine.daylights', 'Daylights'), machine.daylights !== null && machine.daylights !== undefined ? formatCount(machine.daylights) : null],
                      [t('cc_production.machine.working', 'Working'), machine.isWorking ? t('cc_production.machine.yes', 'Yes') : t('cc_production.machine.no', 'No')],
                    ] as Array<[string, React.ReactNode]>)
                  : []),
                [t('cc_production.machine.notes', 'Notes'), machine.notes],
              ]}
            />
          </Panel>
        }
      />
    </RecordPage>
  )
}

export default MachinePage
