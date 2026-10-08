"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleDashed, Download, ExternalLink, FileText, Pencil, Printer, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { AttachmentsSection } from '@open-mercato/ui/backend/detail/AttachmentsSection'
import { Button } from '@open-mercato/ui/primitives/button'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { companyHeader, type DocCompany } from '../../../cc_orders/components/printDocs'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { formatDateTime } from '../../../cc_orders/components/format'
import { day } from '../resin/shared'
import { LAB_ENTITY, fileSize } from './LabForm'
import type { LabReportFile, LabResult, LabTest } from './types'
import { PageLoading } from '../../../cc_ui/components/PageLoading'

const RESULT_STYLE: Record<LabResult, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  pass: { label: 'Pass', tone: 'border-status-success-border bg-status-success-bg text-status-success-text', icon: CheckCircle2 },
  fail: { label: 'Fail', tone: 'border-status-error-border bg-status-error-bg text-status-error-text', icon: XCircle },
  pending: { label: 'Pending', tone: 'border-status-warning-border bg-status-warning-bg text-status-warning-text', icon: CircleDashed },
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function printSummary(test: LabTest, company: DocCompany | null): boolean {
  const popup = window.open('', '_blank', 'width=900,height=1100')
  if (!popup) return false
  const rows: Array<[string, string]> = [
    ['Testing point', test.testPoint === 'incoming' ? 'Raw material in' : 'Finished goods out'],
    ['Tested on', day(test.testDate)],
    ['Test type', test.testType],
    ['Standard', test.standard ?? '—'],
    ['Lot(s)', test.lotRefs ?? '—'],
    ['Item', test.itemTitle ?? '—'],
    ['Customer', test.customerName ?? '—'],
    ['Order', test.orderNo ?? '—'],
    ['Tested by', test.testedBy ?? '—'],
    ['Report file(s)', (test.reports ?? []).map((file) => file.fileName).join(', ') || 'Not attached'],
  ]
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lab test ${esc(test.reportNo ?? day(test.testDate))}</title>
  <style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
  .top{display:flex;justify-content:space-between;border-bottom:2px solid #1c1917;padding-bottom:14px}h1{font-size:20px;margin:0}.muted{color:#78716c;font-size:11px}.code{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
  .doc{text-align:right}.kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c}.no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
  .result{display:inline-block;margin-top:6px;padding:4px 12px;border-radius:999px;font-weight:700;border:1px solid #1c1917}
  table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:8px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top}td.k{width:32%;color:#78716c}
  .sign{display:flex;justify-content:space-between;margin-top:64px}.sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}@media print{body{padding:14mm}}</style></head><body>
  <div class="top">${companyHeader(company, 'Quality control · lab test record')}<div class="doc"><div class="kind">Lab test record</div><div class="no">${esc(test.reportNo ?? '—')}</div><div class="result">${esc(RESULT_STYLE[test.result].label.toUpperCase())}</div></div></div>
  <table>${rows.map(([key, value]) => `<tr><td class="k">${esc(key)}</td><td>${esc(value)}</td></tr>`).join('')}</table>
  ${test.notes ? `<p style="margin-top:16px"><span class="muted">Remarks</span><br>${esc(test.notes)}</p>` : ''}
  <p class="muted" style="margin-top:16px">The laboratory's own report is attached to this record in the ERP.</p>
  <div class="sign"><div>Tested by${test.testedBy ? `<br>${esc(test.testedBy)}` : ''}</div><div>QC in-charge</div></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},200)})</script></body></html>`)
  popup.document.close()
  return true
}

function ReportPreview({ file }: { file: LabReportFile }) {
  const src = `/api/attachments/file/${file.id}`
  if (file.mimeType.startsWith('image/')) return <img src={src} alt={file.fileName} className="max-h-[70vh] w-full rounded-lg border object-contain" />
  if (file.mimeType === 'application/pdf') return <iframe src={src} title={file.fileName} className="h-[70vh] w-full rounded-lg border" />
  return null
}

export function LabDetailPage({ testId }: { testId: string }) {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const [test, setTest] = React.useState<LabTest | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [company, setCompany] = React.useState<DocCompany | null>(null)
  const [previewId, setPreviewId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const call = await apiCall<LabTest>(`/api/cc_production/lab?id=${encodeURIComponent(testId)}`)
    if (call.ok && call.result) {
      setTest(call.result)
      setPreviewId((current) => current ?? call.result?.reports?.find((file) => file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/'))?.id ?? null)
    } else setError(t('cc_production.lab.loadError', 'Could not load the lab test.'))
  }, [testId, t])

  React.useEffect(() => {
    void load()
    apiCall<DocCompany>('/api/cc_accounts/company').then((call) => setCompany(call.ok ? (call.result ?? null) : null))
  }, [load])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!test) return <Page><PageBody><PageLoading label={t('cc_production.lab.loading', 'Loading…')} /></PageBody></Page>

  const style = RESULT_STYLE[test.result]
  const ResultIcon = style.icon
  const reports = test.reports ?? []
  const preview = reports.find((file) => file.id === previewId) ?? null

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    { label: t('cc_production.lab.point', 'Testing point'), value: test.testPoint === 'incoming' ? t('cc_production.lab.incoming', 'Raw material in') : t('cc_production.lab.outgoing', 'Finished goods out') },
    { label: t('cc_production.lab.testedOn', 'Tested on'), value: day(test.testDate) },
    { label: t('cc_production.lab.standard', 'Standard'), value: test.standard ?? '—' },
    { label: t('cc_production.lab.testedBy', 'Tested by'), value: test.testedBy ?? '—' },
    { label: t('cc_production.lab.lots', 'Lot(s)'), value: test.lotRefs ? <span className="font-mono text-xs">{test.lotRefs}</span> : '—' },
    { label: t('cc_production.lab.item', 'Item'), value: test.itemTitle ?? '—' },
    { label: t('cc_production.moulding.customer', 'Customer'), value: test.customerId ? <Link className="text-primary hover:underline" href={`/backend/customers/companies/${test.customerId}`}>{test.customerName}</Link> : (test.customerName ?? t('cc_production.lab.noCustomer', 'No particular customer')) },
    { label: t('cc_production.lab.order', 'Order'), value: test.orderId ? <Link className="font-mono text-primary hover:underline" href={`/backend/orders/${test.orderId}/stages/qc`}>{test.orderNo}</Link> : t('cc_production.lab.noOrder', 'Not for an order') },
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
                <Link href="/backend/quality/lab">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('cc_production.lab.entity', 'Lab test report')}</p>
                <h1 className="text-xl font-semibold sm:text-2xl">{test.testType}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{[day(test.testDate), test.reportNo, test.itemTitle].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {reports.length ? (
                <Button asChild>
                  <a href={`/api/attachments/file/${reports[0].id}?download=1`}>
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {reports.length > 1 ? t('cc_production.lab.downloadFirst', 'Download report (1 of {count})', { count: reports.length }) : t('cc_production.lab.download', 'Download report')}
                  </a>
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => { if (!printSummary(test, company)) flash(t('cc_production.lab.popup', 'Allow pop-ups to print.'), 'error') }}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.lab.print', 'Print record')}
              </Button>
              {canEnter ? (
                <Button type="button" variant="outline" onClick={() => router.push(`/backend/quality/lab/${test.id}/edit`)}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.lab.edit', 'Edit')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className={cn('flex items-center gap-3 rounded-xl border p-4', style.tone)}>
            <ResultIcon className="h-6 w-6 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold">{t(`cc_production.lab.${test.result}`, style.label)}</p>
              <p className="text-xs opacity-80">
                {test.result === 'pass'
                  ? test.orderNo
                    ? t('cc_production.lab.passOrder', 'QC done. "Customer tests done" is ticked on order {no}.', { no: test.orderNo })
                    : t('cc_production.lab.passPlain', 'QC done.')
                  : test.result === 'fail'
                    ? t('cc_production.lab.failHint', 'Does not meet the standard. Hold the lot or re-test.')
                    : t('cc_production.lab.pendingHint', 'Waiting for the result. Edit the test when the report comes back.')}
              </p>
            </div>
          </div>

          {!reports.length ? <Notice variant="warning" title={t('cc_production.lab.noReportTitle', 'No report attached yet')} message={t('cc_production.lab.noReportBody', 'Upload the lab’s report below so anyone can open or download it.')} /> : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {reports.length ? (
                <section className="rounded-xl border bg-card shadow-xs">
                  <header className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
                    <h2 className="text-sm font-semibold">{t('cc_production.lab.reportFile', 'Lab test report')}</h2>
                    {preview ? (
                      <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/api/attachments/file/${preview.id}`} target="_blank" rel="noopener">
                        {t('cc_production.lab.openNewTab', 'Open in new tab')}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </header>
                  <ul className="divide-y">
                    {reports.map((file) => (
                      <li key={file.id} className={cn('flex items-center gap-3 px-4 py-2.5 sm:px-5', file.id === previewId && 'bg-muted/40')}>
                        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => setPreviewId(file.id)}>
                          {file.fileName}
                        </button>
                        <span className="hidden text-xs text-muted-foreground sm:inline">{fileSize(file.fileSize)}</span>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label={t('cc_production.lab.download', 'Download report')}>
                          <a href={`/api/attachments/file/${file.id}?download=1`}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {preview ? (
                    <div className="border-t p-4 sm:p-5">
                      <ReportPreview file={preview} />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {canEnter ? (
                <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
                  <AttachmentsSection entityId={LAB_ENTITY} recordId={test.id} title={reports.length ? t('cc_production.lab.moreFiles', 'Add or remove files') : t('cc_production.lab.uploadTitle', 'Upload the lab test report')} onChanged={() => void load()} compact />
                </section>
              ) : null}
            </div>

            <aside className="space-y-5">
              <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
                <h2 className="mb-3 text-sm font-semibold">{t('cc_production.lab.details', 'Details')}</h2>
                <dl className="space-y-3">
                  {facts.map((fact) => (
                    <div key={fact.label} className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-xs text-muted-foreground">{fact.label}</dt>
                      <dd className="text-right text-sm">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                {test.notes ? (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs text-muted-foreground">{t('cc_production.resin.notes', 'Remarks')}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{test.notes}</p>
                  </div>
                ) : null}
              </section>
              <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
                <h2 className="mb-3 text-sm font-semibold">{t('cc_production.lab.history', 'History')}</h2>
                <ol className="relative space-y-4 border-l pl-4">
                  {[...test.history].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                      <p className="font-medium first-letter:uppercase">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ''}
                      </p>
                      {entry.note ? <p className="text-xs text-muted-foreground">{entry.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
