"use client"

import * as React from 'react'
import Link from 'next/link'
import { ExternalLink, ListChecks, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, FieldList, type Fact } from '../../cc_ui/components/RecordPage'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'
import { useSend } from '../../cc_production/components/finishing/shared'

type Change = { field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null }
type SettingsChangeView = {
  id: string
  area: string
  areaLabel: string
  areaPath: string
  key: string
  label: string
  changes: Change[]
  by: string | null
  at: string
  status: 'live' | 'undone'
  undoneAt: string | null
  undoneByName: string | null
  undoReason: string | null
  updatedAt: string
  unavailable?: string | null
  blockedBy?: string[]
}

function when(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shown(value: Change['from']): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

const AREAS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All settings' },
  { value: 'list', label: 'Dropdown lists' },
  { value: 'series', label: 'Number series' },
  { value: 'company', label: 'Company details' },
  { value: 'tally', label: 'Tally settings' },
  { value: 'stage', label: 'Order stages' },
]

export function SettingsChangeList() {
  const t = useT()
  const [area, setArea] = React.useState('')
  const [items, setItems] = React.useState<SettingsChangeView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    setItems(null)
    void apiCall<{ items: SettingsChangeView[] }>(`/api/cc_audit/settings-changes${area ? `?area=${area}` : ''}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_audit.settings.loadError', 'Could not load the settings changes.'))
      else setItems(call.result.items)
    })
  }, [area, t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-12">
          <div>
            <h1 className="text-xl font-semibold">{t('cc_audit.settings.title', 'Settings change log')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_audit.settings.lede', 'Every change to the dropdown lists, number series, company details, Tally settings and order stages, with old → new values. A change can be undone for 7 days.')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((entry) => (
              <Button key={entry.value} type="button" size="sm" variant={area === entry.value ? 'default' : 'outline'} onClick={() => setArea(entry.value)}>
                {t(`cc_audit.settings.area.${entry.value || 'all'}`, entry.label)}
              </Button>
            ))}
          </div>
          {!items ? (
            <PageLoading label={t('cc_audit.loading', 'Loading…')} />
          ) : (
            <RegisterGrid
              rows={items}
              rowKey={(row) => row.id}
              rowHref={(row) => `/backend/settings/changes/${row.id}`}
              empty={t('cc_audit.settings.none', 'No settings changes yet.')}
              columns={[
                { key: 'at', label: t('cc_audit.settings.when', 'When'), render: (row) => when(row.at) },
                { key: 'area', label: t('cc_audit.settings.which', 'Which settings'), render: (row) => row.areaLabel },
                { key: 'label', label: t('cc_audit.settings.what', 'What'), render: (row) => row.label },
                { key: 'changes', label: t('cc_audit.settings.fields', 'Changes'), render: (row) => <span className="whitespace-normal text-xs">{row.changes.slice(0, 3).map((change) => `${change.label}: ${shown(change.from)} → ${shown(change.to)}`).join(' · ')}{row.changes.length > 3 ? ` +${row.changes.length - 3}` : ''}</span> },
                { key: 'by', label: t('cc_audit.settings.by', 'By'), render: (row) => row.by ?? '—' },
                { key: 'status', label: '', render: (row) => (row.status === 'undone' ? <StatusBadge variant="neutral">{t('cc_audit.settings.undone', 'Undone')}</StatusBadge> : null) },
              ]}
            />
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export function SettingsChangeDetail({ changeId }: { changeId: string }) {
  const t = useT()
  const send = useSend(`cc-settings-change-${changeId}`)
  const [change, setChange] = React.useState<SettingsChangeView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [undoing, setUndoing] = React.useState(false)
  const load = React.useCallback(async () => {
    const call = await apiCall<SettingsChangeView>(`/api/cc_audit/settings-changes?id=${encodeURIComponent(changeId)}`)
    if (!call.ok || !call.result) setError(t('cc_audit.settings.loadOneError', 'Could not load this change.'))
    else setChange(call.result)
  }, [changeId, t])
  React.useEffect(() => {
    void load()
  }, [load])
  if (error || !change) return <RecordState error={error} loadingLabel={t('cc_audit.loading', 'Loading…')} />
  const canUndo = change.status === 'live' && !change.unavailable
  const facts: Fact[] = [
    { label: t('cc_audit.settings.which', 'Which settings'), value: change.areaLabel },
    { label: t('cc_audit.settings.what', 'What'), value: change.label },
    { label: t('cc_audit.settings.fields', 'Changes'), value: String(change.changes.length) },
    { label: t('cc_audit.settings.by', 'By'), value: change.by ?? '—' },
    { label: t('cc_audit.settings.when', 'When'), value: when(change.at) },
  ]
  const undo = async (reason: string) => {
    const result = await send<SettingsChangeView>('/api/cc_audit/settings-changes', 'POST', { id: change.id, reason }, change.updatedAt)
    if (!result) return false
    flash(t('cc_audit.settings.undoneDone', 'Change undone. The old values are back.'), 'success')
    await load()
    return true
  }
  return (
    <RecordPage
      back={{ href: '/backend/settings/changes', label: t('cc_audit.settings.title', 'Settings change log') }}
      overline={change.areaLabel}
      title={change.label}
      mono={false}
      badges={change.status === 'undone' ? <StatusBadge variant="neutral">{t('cc_audit.settings.undone', 'Undone')}</StatusBadge> : <StatusBadge variant="success">{t('cc_audit.settings.live', 'In force')}</StatusBadge>}
      meta={change.status === 'undone' ? t('cc_audit.settings.undoneMeta', 'Undone {when} by {name}: {reason}', { when: change.undoneAt ? when(change.undoneAt) : '—', name: change.undoneByName ?? '—', reason: change.undoReason ?? '' }) : change.unavailable ?? undefined}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={change.areaPath}>
              <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_audit.settings.open', 'Open the settings')}
            </Link>
          </Button>
          {canUndo ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setUndoing(true)}>
              <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_audit.settings.undo', 'Undo this change')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_audit.settings.oldNew', 'Old → new')} icon={ListChecks} count={change.changes.length} flush>
            <RegisterGrid
              rows={change.changes}
              rowKey={(row) => row.field}
              empty={null}
              columns={[
                { key: 'label', label: t('cc_audit.settings.field', 'Field'), render: (row) => row.label },
                { key: 'from', label: t('cc_audit.settings.old', 'Old'), render: (row) => <span className="whitespace-normal">{shown(row.from)}</span> },
                { key: 'to', label: t('cc_audit.settings.new', 'New'), render: (row) => <span className="whitespace-normal">{shown(row.to)}</span> },
              ]}
            />
          </Panel>
        }
        side={
          <Panel title={t('cc_audit.settings.usedBy', 'Where it is used')}>
            <FieldList columns={1} fields={[[t('cc_audit.settings.screen', 'Settings screen'), <Link key="screen" className="underline-offset-2 hover:underline" href={change.areaPath}>{change.areaLabel}</Link>], [t('cc_audit.settings.key', 'Setting'), change.key]]} />
            {change.blockedBy?.length ? <p className="mt-3 text-xs text-status-warning-text">{change.blockedBy.join(' ')}</p> : null}
          </Panel>
        }
      />
      <Comments type="settings_change" id={change.id} />
      <Timeline type="settings_change" id={change.id} refreshKey={change.updatedAt} />
      <CorrectDialog
        open={undoing}
        onOpenChange={setUndoing}
        title={t('cc_audit.settings.undoTitle', 'Undo this settings change')}
        confirmLabel={t('cc_audit.settings.undo', 'Undo this change')}
        loadPreview={async () => ({ undo: change.changes.map((row) => `${row.label}: ${shown(row.to)} → ${shown(row.from)}`), blockedBy: (change.blockedBy ?? []).map((label) => ({ label, href: null })) })}
        onConfirm={undo}
      />
    </RecordPage>
  )
}
