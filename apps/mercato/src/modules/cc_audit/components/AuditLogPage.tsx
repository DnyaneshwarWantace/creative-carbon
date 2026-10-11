"use client"

import * as React from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { RegisterGrid } from '../../cc_ui/components/RecordPage'
import { Dropdown } from '../../cc_lists/components/Dropdown'

type Row = { at: string; recordType: string; record: string; action: string; kind: string; summary: string; reason: string; changes: string; by: string; source: string; link: string }

function isoDay(offset: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

const KINDS = ['', 'change', 'stage', 'document', 'correction', 'comment', 'attachment', 'system']

export function AuditLogPage() {
  const t = useT()
  const [from, setFrom] = React.useState(isoDay(-30))
  const [to, setTo] = React.useState(isoDay(0))
  const [actor, setActor] = React.useState('')
  const [kind, setKind] = React.useState('')
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const query = React.useMemo(() => {
    const params = new URLSearchParams({ from, to })
    if (actor.trim()) params.set('actor', actor.trim())
    if (kind) params.set('kind', kind)
    return params.toString()
  }, [actor, from, kind, to])
  const load = React.useCallback(async () => {
    setRows(null)
    const call = await apiCall<{ items: Row[] }>(`/api/cc_audit/log?${query}`)
    if (!call.ok || !call.result) setError(t('cc_audit.log.loadError', 'Could not load the activity log. It needs the auditor right.'))
    else setRows(call.result.items)
  }, [query, t])
  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-12">
          <div>
            <h1 className="text-xl font-semibold">{t('cc_audit.log.title', 'Activity log')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_audit.log.lede', 'Every change on every record: who, when, why and old → new. Filter it and export it to Excel for the auditors.')}</p>
          </div>
          <form
            className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault()
              void load()
            }}
          >
            <div className="space-y-1"><Label htmlFor="log-from">{t('cc_audit.log.from', 'From')}</Label><Input id="log-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="log-to">{t('cc_audit.log.to', 'To')}</Label><Input id="log-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="log-actor">{t('cc_audit.log.person', 'Person')}</Label><Input id="log-actor" value={actor} onChange={(event) => setActor(event.target.value)} placeholder={t('cc_audit.log.personHint', 'Name')} /></div>
            <div className="space-y-1">
              <Label htmlFor="log-kind">{t('cc_audit.log.kind', 'Kind')}</Label>
              <Dropdown id="log-kind" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value)}>
                {KINDS.map((value) => <option key={value} value={value}>{value ? value : t('cc_audit.log.allKinds', 'All kinds')}</option>)}
              </Dropdown>
            </div>
            <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
              <Button type="submit" size="sm"><Search className="mr-1.5 h-4 w-4" aria-hidden="true" />{t('cc_audit.log.show', 'Show')}</Button>
              <Button asChild type="button" size="sm" variant="outline">
                <a href={`/api/cc_audit/log?${query}&format=xlsx`}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />{t('cc_audit.log.export', 'Excel')}</a>
              </Button>
            </div>
          </form>
          {!rows ? (
            <PageLoading label={t('cc_audit.loading', 'Loading…')} />
          ) : (
            <RegisterGrid
              rows={rows}
              rowKey={(row) => `${row.at}-${row.link}-${row.action}`}
              rowHref={(row) => row.link || null}
              empty={t('cc_audit.log.none', 'Nothing in this period.')}
              columns={[
                { key: 'at', label: t('cc_audit.log.when', 'When'), render: (row) => new Date(row.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                { key: 'record', label: t('cc_audit.log.record', 'Record'), render: (row) => (row.link ? <Link href={row.link} className="underline-offset-2 hover:underline">{row.recordType} {row.record}</Link> : `${row.recordType} ${row.record}`) },
                { key: 'action', label: t('cc_audit.log.action', 'Action'), render: (row) => row.action },
                { key: 'changes', label: t('cc_audit.log.changes', 'Old → new / reason'), render: (row) => <span className="whitespace-normal text-xs">{[row.changes, row.reason].filter(Boolean).join(' · ') || row.summary}</span> },
                { key: 'by', label: t('cc_audit.log.by', 'Who'), render: (row) => row.by || '—' },
              ]}
            />
          )}
          {rows && rows.length >= 500 ? <p className="text-xs text-muted-foreground">{t('cc_audit.log.capped', 'Showing the newest 500. The Excel export has every row.')}</p> : null}
        </div>
      </PageBody>
    </Page>
  )
}
