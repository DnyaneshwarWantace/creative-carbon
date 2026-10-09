"use client"

import * as React from 'react'
import Link from 'next/link'
import { Download, ExternalLink, FileSpreadsheet, History, TriangleAlert, Upload } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, FieldList, type Fact } from '../../cc_ui/components/RecordPage'

export type RegisterTile = {
  key: string
  label: string
  department: string
  paperRef: string | null
  hint: string
  dated: boolean
  canUpload: boolean
  columns: Array<{ key: string; label: string; required: boolean }>
  lastUpload: { at: string; byName: string | null; total: number; failed: number; fileName: string } | null
}

type Report = {
  dryRun: boolean
  fileName: string
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  plan: string[]
  unknownHeaders: string[]
  errors: Array<{ row: number; error: string }>
  failedRows: Array<{ row: number; values: Record<string, string>; reason: string }>
  previousUpload: { at: string; byName: string | null } | null
}

type HistoryRow = { id: string; register: string; fileName: string; registerDate: string | null; total: number; created: number; updated: number; failed: number; byName: string | null; at: string }
type UploadView = HistoryRow & { registerLabel: string; department: string | null; paperRef: string | null; fileHash: string; errors: Array<{ row: number; error: string }> }

function registerHref(register: string, date: string | null): string {
  const dated = (path: string) => (date ? `${path}?date=${encodeURIComponent(date)}` : path)
  if (register === 'resin_batches') return '/backend/resin/batches'
  if (register === 'dryer_sheets' || register === 'dryer_slots') return '/backend/coating'
  if (register === 'press_loading') return dated('/backend/press/loading')
  if (register === 'moulding') return dated('/backend/moulding')
  if (register === 'moulds') return '/backend/masters/moulds'
  if (register === 'tolerances') return '/backend/masters/tolerance'
  if (register === 'prices') return '/backend/masters/prices'
  return '/backend/upload'
}

function when(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function useRegisters() {
  const t = useT()
  const [items, setItems] = React.useState<RegisterTile[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<{ items?: RegisterTile[]; error?: string }>('/api/cc_production/upload').then((call) => {
      if (!call.ok || !call.result?.items) setError(call.result?.error ?? t('cc_production.upload.loadError', 'Could not load the upload centre.'))
      else setItems(call.result.items)
    })
  }, [t])
  return { items, error }
}

export function UploadCentre() {
  const t = useT()
  const { items, error } = useRegisters()
  const groups = React.useMemo(() => {
    const map = new Map<string, RegisterTile[]>()
    for (const item of items ?? []) map.set(item.department, [...(map.get(item.department) ?? []), item])
    return Array.from(map.entries())
  }, [items])
  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{t('cc_production.upload.title', 'Upload centre')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_production.upload.lede', 'Download the Excel template of a register, fill it like the book, and upload it. You see what will be saved before anything is posted; rows with problems come back in a file with a reason.')}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/backend/upload/history">
                <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.upload.history', 'Upload history')}
              </Link>
            </Button>
          </div>
          {error ? <ErrorMessage label={error} /> : null}
          {!items && !error ? <PageLoading label={t('cc_production.upload.loading', 'Loading…')} /> : null}
          {groups.map(([department, tiles]) => (
            <section key={department} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{department}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {tiles.map((tile) => (
                  <div key={tile.key} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
                        <FileSpreadsheet className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{tile.label}</p>
                        {tile.paperRef ? <p className="text-xs text-muted-foreground">{tile.paperRef}</p> : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tile.lastUpload
                        ? t('cc_production.upload.last', 'Last upload {when} by {by}: {total} rows, {failed} to fix', { when: when(tile.lastUpload.at), by: tile.lastUpload.byName ?? '—', total: tile.lastUpload.total, failed: tile.lastUpload.failed })
                        : t('cc_production.upload.never', 'Not uploaded yet')}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/api/cc_production/upload/template?register=${tile.key}&date=${todayIso()}`}>
                          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t('cc_production.upload.template', 'Template')}
                        </a>
                      </Button>
                      {tile.canUpload ? (
                        <Button asChild size="sm">
                          <Link href={`/backend/upload/${tile.key}`}>
                            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('cc_production.upload.upload', 'Upload')}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PageBody>
    </Page>
  )
}

export function UploadRegisterPage({ registerKey }: { registerKey: string }) {
  const t = useT()
  const { items, error } = useRegisters()
  const { runMutation } = useGuardedMutation({ contextId: `cc-upload-${registerKey}` })
  const tile = items?.find((item) => item.key === registerKey) ?? null
  const [file, setFile] = React.useState<File | null>(null)
  const [date, setDate] = React.useState(todayIso())
  const [report, setReport] = React.useState<Report | null>(null)
  const [busy, setBusy] = React.useState(false)

  const send = async (dryRun: boolean) => {
    if (!file) {
      flash(t('cc_production.upload.chooseFile', 'Choose the Excel or CSV file first.'), 'error')
      return
    }
    const form = new FormData()
    form.set('register', registerKey)
    form.set('dryRun', String(dryRun))
    form.set('file', file)
    setBusy(true)
    try {
      const request = () => apiCall<Report & { error?: string }>('/api/cc_production/upload', { method: 'POST', body: form })
      const call = dryRun ? await request() : await runMutation({ context: { resourceKind: `cc_production.upload.${registerKey}`, resourceId: file.name }, mutationPayload: { register: registerKey, fileName: file.name }, operation: request })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.upload.failed', 'Could not read the file.'), 'error')
        return
      }
      setReport(call.result)
      if (!dryRun) flash(t('cc_production.upload.posted', 'Posted: {created} new, {updated} updated, {failed} to fix.', { created: call.result.created, updated: call.result.updated, failed: call.result.failed }), call.result.failed ? 'warning' : 'success')
    } finally {
      setBusy(false)
    }
  }

  const downloadErrors = async () => {
    if (!report?.failedRows.length) return
    const call = await apiCall<Blob>('/api/cc_production/upload/errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ register: registerKey, rows: report.failedRows }) }, { parse: (response) => response.blob() })
    if (!call.ok || !call.result) {
      flash(t('cc_production.upload.errorFileFailed', 'Could not make the file.'), 'error')
      return
    }
    saveBlob(call.result, `${tile?.label ?? registerKey}-rows-to-fix.xlsx`)
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!items) return <Page><PageBody><PageLoading label={t('cc_production.upload.loading', 'Loading…')} /></PageBody></Page>
  if (!tile) return <Page><PageBody><ErrorMessage label={t('cc_production.upload.unknown', 'This register cannot be uploaded.')} /></PageBody></Page>

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <div>
            <Link href="/backend/upload" className="text-xs text-muted-foreground hover:text-foreground">
              {t('cc_production.upload.back', '← Upload centre')}
            </Link>
            <h1 className="text-xl font-semibold">{t('cc_production.upload.uploadTitle', 'Upload {register}', { register: tile.label })}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{tile.hint}</p>
          </div>

          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <li className="space-y-2 rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">{t('cc_production.upload.step1', '1. Get the template')}</p>
              {tile.dated ? <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.upload.date', 'Register date')} /> : null}
              <Button asChild size="sm" variant="outline">
                <a href={`/api/cc_production/upload/template?register=${tile.key}&date=${date}`}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.upload.template', 'Template')}
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">{t('cc_production.upload.columns', 'Columns: {list}', { list: tile.columns.map((column) => `${column.label}${column.required ? ' *' : ''}`).join(', ') })}</p>
            </li>
            <li className="space-y-2 rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">{t('cc_production.upload.step2', '2. Choose the filled file')}</p>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setReport(null)
                }}
                className="text-sm"
                aria-label={t('cc_production.upload.file', 'Excel or CSV file')}
              />
              <Button size="sm" variant="outline" disabled={!file || busy} onClick={() => void send(true)}>
                {t('cc_production.upload.check', 'Check the file')}
              </Button>
            </li>
            <li className="space-y-2 rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">{t('cc_production.upload.step3', '3. Post the good rows')}</p>
              <p className="text-xs text-muted-foreground">{t('cc_production.upload.step3Hint', 'Only rows without problems are posted. Posting the same rows again does not create them twice.')}</p>
              <Button size="sm" disabled={!report || !report.dryRun || busy || report.created + report.updated === 0} onClick={() => void send(false)}>
                <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.upload.post', 'Post {count} rows', { count: report ? report.created + report.updated : 0 })}
              </Button>
            </li>
          </ol>

          {report ? (
            <section className="space-y-3 rounded-lg border bg-card p-4" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={report.dryRun ? 'info' : 'success'}>{report.dryRun ? t('cc_production.upload.checked', 'Checked, nothing saved yet') : t('cc_production.upload.done', 'Posted')}</StatusBadge>
                <span className="text-sm">
                  {t('cc_production.upload.summary', '{total} rows · {created} new · {updated} update · {failed} to fix', { total: report.total, created: report.created, updated: report.updated, failed: report.failed })}
                </span>
              </div>
              {report.previousUpload ? (
                <p className="text-sm text-status-warning-text">
                  {t('cc_production.upload.sameFile', 'This exact file was already posted {when} by {by}. Rows already in the system are updated, not added again.', { when: when(report.previousUpload.at), by: report.previousUpload.byName ?? '—' })}
                </p>
              ) : null}
              {report.plan.length ? (
                <ul className="list-disc pl-5 text-sm">
                  {report.plan.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {report.unknownHeaders.length ? <p className="text-xs text-muted-foreground">{t('cc_production.upload.ignored', 'Columns not used: {list}', { list: report.unknownHeaders.join(', ') })}</p> : null}
              {report.errors.length ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{t('cc_production.upload.toFix', 'Rows to fix')}</p>
                    <Button size="sm" variant="outline" onClick={() => void downloadErrors()}>
                      <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.upload.errorFile', 'Download rows to fix')}
                    </Button>
                  </div>
                  <ul className="max-h-72 overflow-y-auto rounded-md border text-sm">
                    {report.errors.map((entry, index) => (
                      <li key={`${entry.row}-${index}`} className={cn('flex gap-3 px-3 py-1.5', index % 2 === 1 && 'bg-muted/30')}>
                        <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{t('cc_production.upload.row', 'Row {row}', { row: entry.row })}</span>
                        <span className="text-status-error-text">{entry.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export function UploadHistory() {
  const t = useT()
  const [items, setItems] = React.useState<HistoryRow[] | null>(null)
  React.useEffect(() => {
    void apiCall<{ items?: HistoryRow[] }>('/api/cc_production/upload/history').then((call) => setItems(call.result?.items ?? []))
  }, [])
  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div>
            <Link href="/backend/upload" className="text-xs text-muted-foreground hover:text-foreground">
              {t('cc_production.upload.back', '← Upload centre')}
            </Link>
            <h1 className="text-xl font-semibold">{t('cc_production.upload.history', 'Upload history')}</h1>
          </div>
          {!items ? (
            <PageLoading label={t('cc_production.upload.loading', 'Loading…')} />
          ) : (
            <Panel title={t('cc_production.upload.history', 'Upload history')} icon={History} count={items.length} flush>
              <RegisterGrid
                rows={items}
                rowKey={(row) => row.id}
                rowHref={(row) => `/backend/upload/history/${row.id}`}
                empty={t('cc_production.upload.noHistory', 'Nothing uploaded yet.')}
                columns={[
                  { key: 'at', label: t('cc_production.upload.colWhen', 'When'), render: (row) => when(row.at) },
                  { key: 'register', label: t('cc_production.upload.colRegister', 'Register'), render: (row) => row.register },
                  { key: 'file', label: t('cc_production.upload.colFile', 'File'), render: (row) => row.fileName },
                  { key: 'by', label: t('cc_production.upload.colBy', 'By'), render: (row) => row.byName ?? '—' },
                  { key: 'rows', label: t('cc_production.upload.colRows', 'Rows'), align: 'right', render: (row) => row.total },
                  { key: 'new', label: t('cc_production.upload.colNew', 'New'), align: 'right', render: (row) => row.created },
                  { key: 'updated', label: t('cc_production.upload.colUpdated', 'Updated'), align: 'right', render: (row) => row.updated },
                  { key: 'fix', label: t('cc_production.upload.colFix', 'To fix'), align: 'right', render: (row) => <span className={cn(row.failed && 'font-semibold text-status-error-text')}>{row.failed}</span> },
                ]}
              />
            </Panel>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export function UploadDetail({ uploadId }: { uploadId: string }) {
  const t = useT()
  const [upload, setUpload] = React.useState<UploadView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<UploadView>(`/api/cc_production/upload/history?id=${encodeURIComponent(uploadId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.upload.loadOneError', 'Could not load this upload.'))
      else setUpload(call.result)
    })
  }, [t, uploadId])
  if (error || !upload) return <RecordState error={error} loadingLabel={t('cc_production.upload.loading', 'Loading…')} />
  const facts: Fact[] = [
    { label: t('cc_production.upload.colRows', 'Rows'), value: String(upload.total) },
    { label: t('cc_production.upload.colNew', 'New'), value: String(upload.created), tone: upload.created ? 'good' : undefined },
    { label: t('cc_production.upload.colUpdated', 'Updated'), value: String(upload.updated) },
    { label: t('cc_production.upload.colFix', 'To fix'), value: String(upload.failed), tone: upload.failed ? 'bad' : undefined },
    { label: t('cc_production.upload.registerDate', 'Register date'), value: upload.registerDate ?? '—' },
    { label: t('cc_production.upload.colBy', 'By'), value: upload.byName ?? '—' },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/upload/history', label: t('cc_production.upload.history', 'Upload history') }}
      overline={[upload.paperRef, upload.registerLabel].filter(Boolean).join(' · ')}
      title={upload.fileName}
      badges={upload.failed ? <StatusBadge variant="warning">{t('cc_production.upload.someFailed', '{count} rows to fix', { count: upload.failed })}</StatusBadge> : <StatusBadge variant="success">{t('cc_production.upload.allIn', 'All rows in')}</StatusBadge>}
      meta={when(upload.at)}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={registerHref(upload.register, upload.registerDate)}>
              <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.upload.openRegister', 'Open the register')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/backend/upload/${upload.register}`}>
              <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.upload.again', 'Upload again')}
            </Link>
          </Button>
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.upload.toFix', 'Rows to fix')} icon={TriangleAlert} count={upload.errors.length} flush>
            <RegisterGrid
              rows={upload.errors}
              rowKey={(entry) => `${entry.row}-${entry.error}`}
              empty={t('cc_production.upload.nothingToFix', 'Every row went in. Nothing to fix.')}
              columns={[
                { key: 'row', label: t('cc_production.upload.sheetRow', 'Sheet row'), align: 'right', render: (entry) => entry.row },
                { key: 'error', label: t('cc_production.upload.why', 'Why it did not go in'), render: (entry) => <span className="whitespace-normal">{entry.error}</span> },
              ]}
            />
          </Panel>
        }
        side={
          <Panel title={t('cc_production.upload.file', 'File')} icon={FileSpreadsheet}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_production.upload.colRegister', 'Register'), upload.registerLabel],
                [t('cc_production.upload.department', 'Department'), upload.department],
                [t('cc_production.upload.paper', 'Paper form'), upload.paperRef],
                [t('cc_production.upload.colFile', 'File'), upload.fileName],
                [t('cc_production.upload.fingerprint', 'File fingerprint'), <span key="hash" className="text-xs">{upload.fileHash.slice(0, 12)}</span>],
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t('cc_production.upload.sameFile', 'The fingerprint is kept, so uploading this same file again shows a warning that it was already uploaded.')}</p>
          </Panel>
        }
      />
    </RecordPage>
  )
}
