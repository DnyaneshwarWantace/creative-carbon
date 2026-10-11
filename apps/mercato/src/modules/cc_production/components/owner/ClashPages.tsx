"use client"

import * as React from 'react'
import Link from 'next/link'
import { CloudOff, ExternalLink, GitCompare, RotateCcw, ShieldCheck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { PageLoading } from '../../../cc_ui/components/PageLoading'
import { FieldList, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { Comments } from '../../../cc_ui/components/Comments'
import { Timeline } from '../../../cc_ui/components/Timeline'
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'
import { useSend } from '../finishing/shared'
import { when } from '../resin/shared'

type Difference = { field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null }
type Clash = {
  id: string
  screen: string
  recordRef: string
  detail: string | null
  byName: string | null
  at: string
  queuedAt: string | null
  recordType: string | null
  recordHref: string | null
  serverByName: string | null
  canPick: boolean
  differences: Difference[]
  status: 'open' | 'resolved'
  kept: 'offline' | 'server' | null
  resolvedAt: string | null
  resolvedByName: string | null
  resolveReason: string | null
  updatedAt: string
}

function shown(value: Difference['from']): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function StatusOf({ clash }: { clash: Clash }) {
  const t = useT()
  if (clash.status === 'open') return <StatusBadge variant="warning">{t('cc_production.clash.open', 'To check')}</StatusBadge>
  return <StatusBadge variant="success">{clash.kept === 'server' ? t('cc_production.clash.keptServer', 'Earlier version put back') : t('cc_production.clash.keptOffline', 'Offline save kept')}</StatusBadge>
}

export function ClashListPage() {
  const t = useT()
  const [items, setItems] = React.useState<Clash[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<{ items: Clash[] }>('/api/cc_production/clash?status=all').then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.clash.loadError', 'Could not load the sync clashes.'))
      else setItems(call.result.items)
    })
  }, [t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!items) return <Page><PageBody><PageLoading label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-12">
          <div>
            <h1 className="text-xl font-semibold">{t('cc_production.clash.title', 'Sync clashes')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_production.clash.lede', 'A save made on a phone without network that landed on a record someone had changed meanwhile. The offline save wins; both versions are kept here so the manager can put the other one back.')}</p>
          </div>
          <RegisterGrid
            rows={items}
            rowKey={(clash) => clash.id}
            rowHref={(clash) => `/backend/sync/clashes/${clash.id}`}
            empty={t('cc_production.clash.none', 'No sync clashes.')}
            columns={[
              { key: 'at', label: t('cc_production.clash.when', 'When'), render: (clash) => when(clash.at) },
              { key: 'screen', label: t('cc_production.clash.screen', 'Screen'), render: (clash) => clash.screen },
              { key: 'record', label: t('cc_production.clash.record', 'Record'), render: (clash) => clash.recordRef },
              { key: 'by', label: t('cc_production.clash.by', 'Saved offline by'), render: (clash) => clash.byName ?? '—' },
              { key: 'status', label: '', render: (clash) => <StatusOf clash={clash} /> },
            ]}
          />
        </div>
      </PageBody>
    </Page>
  )
}

export function ClashDetailPage({ clashId }: { clashId: string }) {
  const t = useT()
  const granted = useGranted()
  const send = useSend(`cc-clash-${clashId}`)
  const [clash, setClash] = React.useState<Clash | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState<'offline' | 'server' | null>(null)
  const load = React.useCallback(async () => {
    const call = await apiCall<Clash>(`/api/cc_production/clash?id=${encodeURIComponent(clashId)}`)
    if (!call.ok || !call.result) setError(t('cc_production.clash.loadOneError', 'Could not load this clash.'))
    else setClash(call.result)
  }, [clashId, t])
  React.useEffect(() => {
    void load()
  }, [load])
  if (error || !clash) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const canPick = clash.status === 'open' && granted.has('cc_production.owner.view')
  const pick = async (keep: 'offline' | 'server', reason: string) => {
    const result = await send<Clash>('/api/cc_production/clash/pick', 'POST', { id: clash.id, keep, reason }, clash.updatedAt)
    if (!result) return false
    flash(keep === 'server' ? t('cc_production.clash.putBack', 'The earlier version is back on the record.') : t('cc_production.clash.keptDone', 'The offline save stays.'), 'success')
    await load()
    return true
  }
  const facts: Fact[] = [
    { label: t('cc_production.clash.record', 'Record'), value: clash.recordRef },
    { label: t('cc_production.clash.by', 'Saved offline by'), value: clash.byName ?? '—' },
    { label: t('cc_production.clash.savedAt', 'Saved on the phone'), value: clash.queuedAt ? when(clash.queuedAt) : '—' },
    { label: t('cc_production.clash.synced', 'Synced'), value: when(clash.at) },
    { label: t('cc_production.clash.overwrote', 'Overwrote a change by'), value: clash.serverByName ?? '—' },
    { label: t('cc_production.clash.fields', 'Fields that differ'), value: String(clash.differences.length), tone: clash.differences.length ? 'warn' : undefined },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/sync/clashes', label: t('cc_production.clash.title', 'Sync clashes') }}
      overline={[t('cc_production.clash.overline', 'Offline sync clash'), clash.screen].join(' · ')}
      title={clash.recordRef}
      mono={false}
      badges={<StatusOf clash={clash} />}
      meta={clash.status === 'resolved' ? t('cc_production.clash.settled', 'Settled {when} by {name}: {reason}', { when: clash.resolvedAt ? when(clash.resolvedAt) : '—', name: clash.resolvedByName ?? '—', reason: clash.resolveReason ?? '' }) : clash.detail ?? undefined}
      actions={
        <>
          {clash.recordHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={clash.recordHref}>
                <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.clash.openRecord', 'Open the record')}
              </Link>
            </Button>
          ) : null}
          {canPick ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking('offline')}>
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.clash.keepOffline', 'Keep the offline save')}
            </Button>
          ) : null}
          {canPick && clash.canPick ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking('server')}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.clash.keepServer', 'Put the earlier version back')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.clash.compare', 'The two versions')} icon={GitCompare} count={clash.differences.length} flush>
            <RegisterGrid
              rows={clash.differences}
              rowKey={(row) => row.field}
              empty={clash.canPick ? t('cc_production.clash.same', 'Both versions hold the same values.') : t('cc_production.clash.notCaptured', 'This clash was logged before both versions were kept. Check the record itself.')}
              columns={[
                { key: 'label', label: t('cc_production.clash.field', 'Field'), render: (row) => row.label },
                { key: 'server', label: t('cc_production.clash.earlier', 'Earlier version (overwritten)'), render: (row) => shown(row.from) },
                { key: 'offline', label: t('cc_production.clash.offline', 'Offline save (on the record now)'), render: (row) => shown(row.to) },
              ]}
            />
          </Panel>
        }
        side={
          <Panel title={t('cc_production.clash.what', 'What happened')} icon={CloudOff}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_production.clash.screen', 'Screen'), clash.screen],
                [t('cc_production.clash.record', 'Record'), clash.recordHref ? <Link key="rec" className="underline-offset-2 hover:underline" href={clash.recordHref}>{clash.recordRef}</Link> : clash.recordRef],
                [t('cc_production.clash.detail', 'Detail'), clash.detail],
              ]}
            />
          </Panel>
        }
      />
      <Comments type="sync_clash" id={clash.id} />
      <Timeline type="sync_clash" id={clash.id} refreshKey={clash.updatedAt} />
      <CorrectDialog
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        destructive={picking === 'server'}
        title={picking === 'server' ? t('cc_production.clash.keepServer', 'Put the earlier version back') : t('cc_production.clash.keepOffline', 'Keep the offline save')}
        confirmLabel={picking === 'server' ? t('cc_production.clash.keepServer', 'Put the earlier version back') : t('cc_production.clash.keepOffline', 'Keep the offline save')}
        undo={picking === 'server' ? [t('cc_production.clash.undoServer', 'Saves the earlier version over the offline one'), t('cc_production.clash.undoKeep', 'The offline version stays in this clash')] : [t('cc_production.clash.undoOffline', 'Nothing on the record changes; the clash is marked settled')]}
        onConfirm={(reason) => pick(picking ?? 'offline', reason)}
      />
    </RecordPage>
  )
}
