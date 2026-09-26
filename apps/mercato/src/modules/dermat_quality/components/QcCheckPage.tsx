"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Archive, CheckCircle2, FlaskConical, History, Microscope, Pipette, RotateCcw, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { CHECK_LABEL, CHECK_VARIANT, OPERATION_LABEL, PART_LABEL, PART_VARIANT, limitText, when, type QcCheckView, type QcWorksheet } from './shared'

type Part = 'chemical' | 'micro'

const HISTORY_LABEL: Record<string, string> = {
  created: 'Check created',
  saved: 'Observations saved',
  chemical_pass: 'Chemical passed',
  chemical_fail: 'Chemical failed',
  micro_pass: 'Micro passed',
  micro_fail: 'Micro failed',
  retest: 'Re-test started',
  sent_to_rework: 'Sent to rework',
  batch_rejected: 'Batch rejected',
}

const WORKSHEET_KEYS: Array<keyof QcWorksheet> = ['sampledBy', 'sampledAt', 'sampleQty', 'sampleRef', 'platedAt', 'incubationDays', 'retentionQty', 'retentionLocation', 'retentionKeptBy', 'notes']

function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function QcCheckPage({ checkId }: { checkId: string }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-qc-${checkId}` })
  const [check, setCheck] = React.useState<QcCheckView | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [values, setValues] = React.useState<Record<string, { observation: string; remark: string; instrument: string }>>({})
  const [sheet, setSheet] = React.useState<Record<string, string>>({})
  const [batchNo, setBatchNo] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [failing, setFailing] = React.useState<Part | null>(null)
  const [note, setNote] = React.useState('')
  const [retestOpen, setRetestOpen] = React.useState(false)

  const apply = (next: QcCheckView) => {
    setCheck(next)
    setValues(Object.fromEntries(next.results.map((row) => [row.key, { observation: row.observation, remark: row.remark, instrument: row.instrument ?? '' }])))
    setSheet(
      Object.fromEntries(
        WORKSHEET_KEYS.map((key) => {
          const value = next.worksheet?.[key]
          return [key, key === 'sampledAt' || key === 'platedAt' ? toLocalInput(value as string | null) : value === null || value === undefined ? '' : String(value)]
        }),
      ),
    )
    setBatchNo(next.batchNo ?? '')
  }

  const load = React.useCallback(async () => {
    const call = await apiCall<QcCheckView>(`/api/dermat_quality/checks?id=${encodeURIComponent(checkId)}`)
    if (!call.ok || !call.result) {
      setLoadError(t('dermat_quality.errors.load', 'Could not load this QC check.'))
      return
    }
    apply(call.result)
  }, [checkId, t])

  React.useEffect(() => {
    load()
  }, [load])

  const send = async (path: string, method: 'PUT' | 'POST', body: Record<string, unknown>, success: string) => {
    if (!check) return false
    setBusy(true)
    try {
      const call = await runMutation({
        context: { checkId: check.id, path },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(check.updatedAt), () =>
            apiCall<QcCheckView & { error?: string }>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result) {
        flash(
          call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
            ? t('dermat_quality.errors.conflict', 'Someone else changed this check. Reloaded the latest.')
            : (call.result?.error ?? t('dermat_quality.errors.save', 'Could not save.')),
          'error',
        )
        if (call.status === 409) await load()
        return false
      }
      apply(call.result)
      flash(success, 'success')
      return true
    } catch {
      flash(t('dermat_quality.errors.save', 'Could not save.'), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const resultsPayload = () => Object.entries(values).map(([key, value]) => ({ key, observation: value.observation, remark: value.remark, instrument: value.instrument }))

  const sheetPayload = () =>
    Object.fromEntries(
      WORKSHEET_KEYS.map((key) => {
        const raw = (sheet[key] ?? '').trim()
        if (key === 'incubationDays') return [key, raw === '' ? null : Number(raw)]
        if ((key === 'sampledAt' || key === 'platedAt') && raw) return [key, new Date(raw).toISOString()]
        return [key, raw || null]
      }),
    )

  const closed = check?.status === 'reworked' || check?.status === 'rejected'
  const locked = closed || check?.status === 'passed'

  const saveObservations = () =>
    send('/api/dermat_quality/checks', 'PUT', { id: checkId, batchNo, results: locked ? [] : resultsPayload(), worksheet: sheetPayload() }, t('dermat_quality.flash.saved', 'Saved'))

  const decide = async (part: Part, result: 'pass' | 'fail') => {
    if (!check) return
    const partStatus = part === 'chemical' ? check.chemicalStatus : check.microStatus
    if (partStatus === 'pending') {
      const saved = await send('/api/dermat_quality/checks', 'PUT', { id: checkId, batchNo, results: resultsPayload(), worksheet: sheetPayload() }, t('dermat_quality.flash.saved', 'Saved'))
      if (!saved) return
    }
    const ok = await send(
      `/api/dermat_quality/checks/${part}`,
      'POST',
      { id: checkId, result, note: note.trim() || null },
      result === 'pass'
        ? t('dermat_quality.flash.passed', '{part} test passed', { part: part === 'chemical' ? 'Chemical' : 'Micro' })
        : t('dermat_quality.flash.failed', '{part} test failed', { part: part === 'chemical' ? 'Chemical' : 'Micro' }),
    )
    if (ok) {
      setFailing(null)
      setNote('')
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!check) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_quality.loading', 'Loading QC check…')} />
        </PageBody>
      </Page>
    )
  }

  const parts: Array<{ key: Part; label: string; icon: typeof FlaskConical; required: boolean; status: string; by: string | null; at: string | null }> = [
    { key: 'chemical', label: t('dermat_quality.chemical', 'Chemical test'), icon: FlaskConical, required: check.requiresChemical, status: check.chemicalStatus, by: check.chemicalBy, at: check.chemicalAt },
    { key: 'micro', label: t('dermat_quality.micro', 'Micro test'), icon: Microscope, required: check.requiresMicro, status: check.microStatus, by: check.microBy, at: check.microAt },
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <Link href="/backend/qc/checks" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {t('dermat_quality.nav.checks', 'QC checks')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-bold">{check.arNo ?? check.code}</h1>
                <StatusBadge variant={CHECK_VARIANT[check.status] ?? 'neutral'} dot>
                  {t(`dermat_quality.status.${check.status}`, CHECK_LABEL[check.status] ?? check.status)}
                </StatusBadge>
                {check.round > 1 ? <StatusBadge variant="warning">{t('dermat_quality.round', 'Round {round}', { round: check.round })}</StatusBadge> : null}
                <StatusBadge variant="info">{OPERATION_LABEL[check.operation] ?? check.operation}</StatusBadge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {t('dermat_quality.arHint', 'AR no. (analysis report)')} · {check.code}
              </p>
              <p className="text-sm">
                <Link href={`/backend/products/${check.productId}`} className="font-semibold hover:underline">
                  {check.productCode ? <span className="mr-1 font-mono text-muted-foreground">{check.productCode}</span> : null}
                  {check.productTitle}
                </Link>
                {check.orderId ? (
                  <>
                    {' · '}
                    <Link href={`/backend/orders/${check.orderId}/stages/${check.stageKey ?? ''}`} className="font-mono text-primary hover:underline">
                      {check.orderNo}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            {check.status === 'failed' ? (
              <Button type="button" variant="outline" onClick={() => setRetestOpen(true)} disabled={busy}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t('dermat_quality.retest', 'Start re-test')}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <label htmlFor="qc-batch" className="text-xs text-muted-foreground">
                {t('dermat_quality.batch', 'Batch no.')}
              </label>
              <Input id="qc-batch" className="mt-1 h-8" value={batchNo} disabled={locked} onChange={(event) => setBatchNo(event.target.value)} />
            </div>
            {parts.map((part) => (
              <div key={part.key} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <part.icon className="h-3.5 w-3.5" />
                    {part.label}
                  </span>
                  <StatusBadge variant={PART_VARIANT[part.status] ?? 'neutral'}>{PART_LABEL[part.status] ?? part.status}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {part.required ? (part.by ? `${part.by} · ${when(part.at)}` : t('dermat_quality.waiting', 'Waiting for QC')) : t('dermat_quality.notNeeded', 'Not needed by the rule')}
                </p>
              </div>
            ))}
          </div>

          {check.status === 'failed' && check.orderId && check.stageKey && check.stageKey !== 'grn' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-error-border bg-status-error-bg p-3 text-sm text-status-error-text">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t('dermat_quality.failedNext', 'Failed. Choose what happens next: re-test the same sample here, or send the batch back on the order: Rework (step goes back, QC tests again) or Reject batch (written off, new batch).')}
                </span>
              </span>
              <Link href={`/backend/orders/${check.orderId}/stages/${check.stageKey}`} className="shrink-0 font-semibold underline">
                {t('dermat_quality.openStage', 'Open the order stage')}
              </Link>
            </div>
          ) : null}
          {closed ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              {check.status === 'reworked'
                ? t('dermat_quality.closedRework', 'This round was sent to rework. The next round has its own check on the same order stage.')
                : t('dermat_quality.closedReject', 'The batch was rejected. A new batch gets its own check.')}
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex flex-col gap-2 border-b bg-muted/20 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <Pipette className="h-4 w-4 text-primary" />
                  {t('dermat_quality.sheet', 'Sample, micro plating and retention')}
                </CardTitle>
                <CardDescription className="text-xs">{t('dermat_quality.sheetHint', 'Record who drew the sample and when before passing. Retention can be added after passing.')}</CardDescription>
              </div>
              {!closed ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={saveObservations}>
                  {t('dermat_quality.save', 'Save')}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3">
              {(
                [
                  { key: 'sampledBy', label: t('dermat_quality.ws.sampledBy', 'Sample drawn by *'), type: 'text', group: 'sample' },
                  { key: 'sampledAt', label: t('dermat_quality.ws.sampledAt', 'Drawn on *'), type: 'datetime-local', group: 'sample' },
                  { key: 'sampleQty', label: t('dermat_quality.ws.sampleQty', 'Sample quantity'), type: 'text', group: 'sample', placeholder: 'e.g. 200 g' },
                  { key: 'sampleRef', label: t('dermat_quality.ws.sampleRef', 'Taken from (container / drum / carton)'), type: 'text', group: 'sample', placeholder: 'e.g. Vessel V-2, top and bottom' },
                  ...(check.requiresMicro
                    ? [
                        { key: 'platedAt', label: t('dermat_quality.ws.platedAt', 'Micro plated on'), type: 'datetime-local', group: 'micro' },
                        { key: 'incubationDays', label: t('dermat_quality.ws.incubation', 'Incubation days'), type: 'number', group: 'micro', placeholder: '5' },
                      ]
                    : []),
                  { key: 'retentionQty', label: t('dermat_quality.ws.retentionQty', 'Retention sample'), type: 'text', group: 'retention', placeholder: 'e.g. 2 × 30 ml' },
                  { key: 'retentionLocation', label: t('dermat_quality.ws.retentionLocation', 'Kept at'), type: 'text', group: 'retention', placeholder: 'e.g. Retention room, rack R2' },
                  { key: 'retentionKeptBy', label: t('dermat_quality.ws.retentionKeptBy', 'Kept by'), type: 'text', group: 'retention' },
                ] as Array<{ key: keyof QcWorksheet; label: string; type: string; group: string; placeholder?: string }>
              ).map((field) => (
                <div key={field.key} className="space-y-1">
                  <label htmlFor={`qc-ws-${field.key}`} className="flex items-center gap-1 text-xs text-muted-foreground">
                    {field.group === 'retention' ? <Archive className="h-3 w-3" aria-hidden="true" /> : field.group === 'micro' ? <Microscope className="h-3 w-3" aria-hidden="true" /> : null}
                    {field.label}
                  </label>
                  <Input
                    id={`qc-ws-${field.key}`}
                    className="h-8"
                    type={field.type}
                    placeholder={field.placeholder}
                    value={sheet[field.key] ?? ''}
                    disabled={closed || (field.group !== 'retention' && check.status === 'passed')}
                    onChange={(event) => setSheet((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  />
                </div>
              ))}
              {check.requiresMicro && sheet.platedAt ? (
                <p className="text-xs text-muted-foreground md:col-span-3">
                  {(() => {
                    const due = new Date(new Date(sheet.platedAt).getTime() + Number(sheet.incubationDays || 5) * 86400000)
                    return check.microStatus === 'pending'
                      ? t('dermat_quality.ws.due', 'Micro in incubation; results due {date}', { date: when(due.toISOString()) })
                      : t('dermat_quality.ws.plated', 'Plated {date}', { date: when(new Date(sheet.platedAt).toISOString()) })
                  })()}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {retestOpen ? (
            <Card>
              <CardContent className="space-y-2 pt-4">
                <label htmlFor="qc-retest" className="text-sm font-medium">
                  {t('dermat_quality.retestWhy', 'Why is it re-tested? (for example: bulk reworked)')}
                </label>
                <Textarea id="qc-retest" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setRetestOpen(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !note.trim()}
                    onClick={async () => {
                      if (await send('/api/dermat_quality/checks/retest', 'POST', { id: checkId, note }, t('dermat_quality.flash.retest', 'Re-test started'))) {
                        setRetestOpen(false)
                        setNote('')
                      }
                    }}
                  >
                    {t('dermat_quality.retest', 'Start re-test')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {parts
            .filter((part) => part.required)
            .map((part) => {
              const rows = check.results.filter((row) => row.test === part.key)
              const editable = part.status === 'pending'
              return (
                <Card key={part.key} className="overflow-hidden">
                  <CardHeader className="flex flex-col gap-2 border-b bg-muted/20 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm font-bold">
                        <part.icon className="h-4 w-4 text-primary" />
                        {part.label}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {editable
                          ? t('dermat_quality.fillHint', 'Enter the observation for every parameter, then pass or fail this test.')
                          : `${PART_LABEL[part.status]}${part.by ? ` · ${part.by} · ${when(part.at)}` : ''}`}
                      </CardDescription>
                    </div>
                    {editable ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={saveObservations}>
                          {t('dermat_quality.save', 'Save')}
                        </Button>
                        <Button type="button" variant="destructive-ghost" size="sm" disabled={busy} onClick={() => setFailing(part.key)}>
                          <XCircle className="mr-1.5 h-4 w-4" />
                          {t('dermat_quality.fail', 'Fail')}
                        </Button>
                        <Button type="button" size="sm" disabled={busy} onClick={() => decide(part.key, 'pass')}>
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          {t('dermat_quality.pass', 'Pass')}
                        </Button>
                      </div>
                    ) : null}
                  </CardHeader>
                  {failing === part.key ? (
                    <div className="space-y-2 border-b bg-status-error-bg p-3">
                      <label htmlFor={`qc-fail-${part.key}`} className="text-sm font-medium text-status-error-text">
                        {t('dermat_quality.failWhy', 'Why did it fail?')}
                      </label>
                      <Textarea id={`qc-fail-${part.key}`} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setFailing(null)}>
                          {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" disabled={busy || !note.trim()} onClick={() => decide(part.key, 'fail')}>
                          {t('dermat_quality.confirmFail', 'Mark as failed')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">{t('dermat_quality.parameter', 'Parameter')}</th>
                          <th className="w-24 p-3 text-left">{t('dermat_quality.class', 'Class')}</th>
                          <th className="p-3 text-left">{t('dermat_quality.spec', 'Specification')}</th>
                          <th className="w-56 p-3 text-left">{t('dermat_quality.observation', 'Observation')}</th>
                          <th className="w-40 p-3 text-left">{t('dermat_quality.instrument', 'Instrument')}</th>
                          <th className="w-56 p-3 text-left">{t('dermat_quality.remark', 'Remark')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((row) => (
                          <tr key={row.key} className="align-top">
                            <td className="p-3 font-medium">{row.name}</td>
                            <td className="p-3 text-xs">{row.class}</td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {row.spec || (limitText(row) ? '' : '—')}
                              {limitText(row) ? <span className="block font-mono text-foreground">{limitText(row)}</span> : null}
                            </td>
                            <td className="p-2">
                              {(() => {
                                const typed = values[row.key]?.observation ?? ''
                                const value = Number.parseFloat(typed.replace(',', '.'))
                                const hasLimits = limitText(row) !== ''
                                const inSpec = !hasLimits || !typed.trim() || !Number.isFinite(value) ? null : (row.min == null || value >= row.min) && (row.max == null || value <= row.max)
                                return (
                                  <span className="flex items-center gap-1.5">
                                    {editable ? (
                                      <Input
                                        aria-label={`${row.name} observation`}
                                        className="h-8"
                                        value={typed}
                                        onChange={(event) => setValues((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] ?? { remark: '', instrument: '' }), observation: event.target.value } }))}
                                      />
                                    ) : (
                                      <span>{row.observation || '—'}</span>
                                    )}
                                    {inSpec === true ? <StatusBadge variant="success">{t('dermat_quality.inSpec', 'In spec')}</StatusBadge> : inSpec === false ? <StatusBadge variant="error">{t('dermat_quality.outSpec', 'Out of spec')}</StatusBadge> : null}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="p-2">
                              {editable ? (
                                <Input
                                  aria-label={`${row.name} instrument`}
                                  className="h-8"
                                  placeholder="e.g. pH meter PH-02"
                                  value={values[row.key]?.instrument ?? ''}
                                  onChange={(event) => setValues((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] ?? { observation: '', remark: '' }), instrument: event.target.value } }))}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">{row.instrument || '—'}</span>
                              )}
                            </td>
                            <td className="p-2">
                              {editable ? (
                                <Input
                                  aria-label={`${row.name} remark`}
                                  className="h-8"
                                  value={values[row.key]?.remark ?? ''}
                                  onChange={(event) => setValues((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] ?? { observation: '', instrument: '' }), remark: event.target.value } }))}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">{row.remark || '—'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )
            })}

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <History className="h-4 w-4 text-primary" />
                {t('dermat_quality.history', 'History')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ol className="divide-y text-sm">
                {[...check.history].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="px-4 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</span>
                      <span className="text-xs text-muted-foreground">{when(entry.at)}</span>
                    </div>
                    {entry.note ? <p className="text-xs">{entry.note}</p> : null}
                    {entry.by ? <p className="text-xs text-muted-foreground">{entry.by}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </Page>
  )
}

export default QcCheckPage
