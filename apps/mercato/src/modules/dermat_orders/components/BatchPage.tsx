"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, CircleDot, FlaskConical, Package, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { stageDef } from '../lib/stages'
import { formatDate, formatDateTime, formatQty } from './format'
import { BATCH_STATUS, type BatchRow } from './BatchRegister'

type Step = { key: string; status: string; openedAt: string | null; completedAt: string | null; completedByName: string | null; responsibleName: string | null; fields: Record<string, unknown>; ticks: string[]; rework: Array<Record<string, unknown>> }
type Material = { requestCode: string; requestId: string; stageKey: string; store: string | null; productId: string; title: string; code: string | null; unit: string; required: number; issued: number; used: number; returned: number; lots: Array<{ lotNumber: string | null; quantity: number; used: number; returned: number; at: string; by: string | null }> }
type Check = { id: string; code: string; arNo: string | null; round: number; stageKey: string | null; operation: string; productTitle: string; status: string; chemicalStatus: string; microStatus: string; createdAt: string }
type BatchFile = BatchRow & { steps: Step[]; materials: Material[]; checks: Check[] }

const PRODUCTION: Array<{ key: string; unit: string; store: string }> = [
  { key: 'manufacturing', unit: 'kg / ml', store: 'RM store' },
  { key: 'filling', unit: 'bottles / gm / ml', store: 'PM store (bottles, tubes, caps)' },
  { key: 'packing', unit: 'pieces', store: 'PM store (cartons, labels, sample kit)' },
]

const CHECK_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = { passed: 'success', pending: 'warning', failed: 'error', reworked: 'neutral', rejected: 'error' }

function StepMark({ done, active }: { done: boolean; active: boolean }) {
  if (done) return <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-icon" aria-hidden="true" />
  if (active) return <CircleDot className="h-4 w-4 shrink-0 text-status-warning-icon" aria-hidden="true" />
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
}

function fieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export function BatchPage({ batchNo }: { batchNo: string }) {
  const t = useT()
  const [batch, setBatch] = React.useState<BatchFile | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    apiCall<BatchFile & { error?: string }>(`/api/dermat_orders/batches?no=${encodeURIComponent(batchNo)}`).then((call) => {
      if (!call.ok || !call.result) setError(call.result?.error ?? t('dermat_orders.batch.loadError', 'Could not load this batch.'))
      else setBatch(call.result)
    })
  }, [batchNo, t])

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
          <Link href="/backend/production/batches" className="mt-4 inline-block text-sm text-primary hover:underline">
            {t('dermat_orders.batch.back', 'Back to the batch register')}
          </Link>
        </PageBody>
      </Page>
    )
  }
  if (!batch) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_orders.batch.loading', 'Loading batch…')} />
        </PageBody>
      </Page>
    )
  }

  const step = (key: string) => batch.steps.find((entry) => entry.key === key)
  const isDone = (key: string) => ['done', 'skipped'].includes(step(key)?.status ?? '')
  const isActive = (key: string) => ['open', 'on_hold'].includes(step(key)?.status ?? '')
  const qa = step('qc_qa')
  const dispatch = step('dispatch')

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/production/batches" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {t('dermat_orders.batch.register', 'Batch register')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold">{t('dermat_orders.batch.title', 'Batch {no}', { no: batch.batchNo })}</h1>
                <StatusBadge variant={BATCH_STATUS[batch.status].variant}>{BATCH_STATUS[batch.status].label}</StatusBadge>
              </div>
              <p className="text-sm">
                <span className="font-medium">{batch.products.map((product) => product.title).join(', ')}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {batch.orders.map((order, index) => (
                    <React.Fragment key={order.id}>
                      {index ? ', ' : ''}
                      <Link href={`/backend/orders/${order.id}`} className="font-mono hover:underline">
                        {order.orderNo}
                      </Link>
                      {order.customer ? ` (${order.customer})` : ''}
                    </React.Fragment>
                  ))}
                </span>
              </p>
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('dermat_orders.batch.bulk', 'Bulk')}</dt>
                <dd className="font-semibold tabular-nums">{batch.bulkKg !== null ? `${formatQty(batch.bulkKg, 2)} kg` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('dermat_orders.batch.filled', 'Filled')}</dt>
                <dd className="font-semibold tabular-nums">{batch.filled !== null ? formatQty(batch.filled, 0) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('dermat_orders.batch.packed', 'Packed / ordered')}</dt>
                <dd className="font-semibold tabular-nums">
                  {batch.packed !== null ? formatQty(batch.packed, 0) : '—'} / {formatQty(batch.ordered, 0)}
                </dd>
              </div>
            </dl>
          </header>

          <section aria-label={t('dermat_orders.batch.flow', 'Production flow')} className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-11">
            {PRODUCTION.map((column, index) => {
              const entry = step(column.key)
              const def = stageDef(column.key)
              const requests = batch.materials.filter((material) => material.stageKey === column.key)
              const checks = batch.checks.filter((check) => check.stageKey === column.key)
              const latest = checks[checks.length - 1]
              const received = requests.length > 0 && requests.every((material) => material.issued > 0)
              const fields = (def?.fields ?? []).filter((field) => field.type !== 'textarea' && entry?.fields[field.key] !== undefined && entry?.fields[field.key] !== '')
              const sub = column.key === 'packing'
                ? [
                    { label: t('dermat_orders.batch.sample', 'Sample of the finished good'), done: Boolean(entry?.ticks.includes('sample')) || isDone(column.key) },
                    { label: t('dermat_orders.batch.qc', 'QC testing'), done: latest?.status === 'passed', active: latest?.status === 'pending' },
                    { label: t('dermat_orders.batch.allPacked', 'All packaging done'), done: isDone(column.key) },
                  ]
                : [
                    { label: column.key === 'manufacturing' ? t('dermat_orders.batch.rmFromStore', 'Material from RM store') : t('dermat_orders.batch.bottles', 'Bottles / tubes from PM store'), done: received, active: requests.length > 0 && !received },
                    { label: def?.label ?? column.key, done: isDone(column.key), active: isActive(column.key) },
                    { label: t('dermat_orders.batch.qc', 'QC testing'), done: latest?.status === 'passed' || (!checks.length && isDone(column.key)), active: latest?.status === 'pending' },
                  ]
              return (
                <React.Fragment key={column.key}>
                  {index ? (
                    <div className="hidden items-center justify-center text-muted-foreground lg:flex" aria-hidden="true">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  ) : null}
                  <article className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4 lg:col-span-3', isActive(column.key) && 'border-status-warning-border')}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold">{def?.label ?? column.key}</h2>
                        <p className="text-xs text-muted-foreground">{t('dermat_orders.batch.unit', 'Unit: {unit}', { unit: column.unit })}</p>
                      </div>
                      {entry?.completedAt ? <span className="text-xs text-muted-foreground">{formatDateTime(entry.completedAt)}</span> : null}
                    </div>
                    <ol className="space-y-1.5">
                      {sub.map((item) => (
                        <li key={item.label} className="flex items-center gap-2 text-sm">
                          <StepMark done={item.done} active={Boolean('active' in item && item.active)} />
                          <span className={cn(!item.done && 'text-muted-foreground')}>{item.label}</span>
                        </li>
                      ))}
                    </ol>
                    {fields.length ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-xs">
                        {fields.map((field) => (
                          <React.Fragment key={field.key}>
                            <dt className="text-muted-foreground">{field.label}</dt>
                            <dd className="tabular-nums">{field.type === 'date' ? formatDate(String(entry?.fields[field.key])) : fieldValue(entry?.fields[field.key])}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    ) : null}
                    {entry?.rework.length ? (
                      <p className="rounded-md bg-status-warning-bg px-2 py-1 text-xs text-status-warning-text">
                        {entry.rework.map((round) => `${round.type === 'rework' ? t('dermat_orders.batch.reworkRound', 'Rework') : t('dermat_orders.batch.rejectRound', 'Rejected')}: ${String(round.note ?? '')}`).join(' · ')}
                      </p>
                    ) : null}
                    <p className="mt-auto text-xs text-muted-foreground">{t('dermat_orders.batch.from', 'Material from: {store}', { store: column.store })}</p>
                  </article>
                </React.Fragment>
              )
            })}
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className={cn('space-y-2 rounded-lg border bg-card p-4', batch.qa.result === 'Released' ? 'border-status-success-border' : batch.qa.result ? 'border-status-error-border' : '')} aria-labelledby="batch-qa">
              <h2 id="batch-qa" className="flex items-center gap-2 text-sm font-semibold">
                <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('dermat_orders.batch.qaTitle', 'QA release')}
              </h2>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t('dermat_orders.batch.decision', 'Decision')}</dt>
                <dd className="font-medium">{batch.qa.result ?? t('dermat_orders.batch.notYet', 'Not yet')}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.releasedOn', 'Released on')}</dt>
                <dd>{formatDate(batch.qa.releasedOn)}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.coa', 'COA no.')}</dt>
                <dd className="font-mono">{batch.qa.coaNo ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.retention', 'Retention sample')}</dt>
                <dd>{batch.qa.retentionQty !== null ? `${formatQty(batch.qa.retentionQty, 0)}${batch.qa.retentionLocation ? ` · ${batch.qa.retentionLocation}` : ''}` : '—'}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.by', 'By')}</dt>
                <dd>{qa?.completedByName ?? qa?.responsibleName ?? '—'}</dd>
              </dl>
            </section>
            <section className="space-y-2 rounded-lg border bg-card p-4" aria-labelledby="batch-dispatch">
              <h2 id="batch-dispatch" className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('dermat_orders.batch.dispatchTitle', 'Dispatch')}
              </h2>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t('dermat_orders.batch.dispatchDate', 'Dispatched on')}</dt>
                <dd>{formatDate(typeof dispatch?.fields.dispatch_date === 'string' ? dispatch.fields.dispatch_date : null)}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.transporter', 'Transporter')}</dt>
                <dd>{fieldValue(dispatch?.fields.transporter)}</dd>
                <dt className="text-muted-foreground">{t('dermat_orders.batch.lr', 'LR no.')}</dt>
                <dd className="font-mono">{fieldValue(dispatch?.fields.lr_number)}</dd>
              </dl>
            </section>
          </div>

          <section className="space-y-2" aria-labelledby="batch-materials">
            <h2 id="batch-materials" className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('dermat_orders.batch.materials', 'Materials that went into this batch')}
            </h2>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colStep', 'Step')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colMaterial', 'Material')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colLots', 'Lots issued')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batch.colRequired', 'Needed')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batch.colUsed', 'Used')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batch.colReturned', 'Returned')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.materials.map((material) => (
                    <tr key={`${material.requestId}-${material.productId}`} className="align-top">
                      <td className="px-3 py-2 text-xs">
                        {stageDef(material.stageKey)?.label ?? material.stageKey}
                        <Link href={`/backend/store/requests/${material.requestId}`} className="block font-mono text-muted-foreground hover:underline">
                          {material.requestCode}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/backend/store/ledger?productId=${material.productId}`} className="hover:underline">
                          {material.title}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">{material.code ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {material.lots.length
                          ? material.lots.map((lot, index) => (
                              <span key={`${lot.lotNumber}-${index}`} className="block">
                                <span className="font-mono">{lot.lotNumber ?? '—'}</span> · {formatQty(lot.quantity)} {material.unit}
                              </span>
                            ))
                          : <span className="text-status-warning-text">{t('dermat_orders.batch.notIssued', 'Not issued yet')}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatQty(material.required)} {material.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatQty(material.used)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatQty(material.returned)}</td>
                    </tr>
                  ))}
                  {!batch.materials.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {batch.bulkSource === 'Use bulk already made' ? t('dermat_orders.batch.reused', 'This order used bulk from an earlier batch, so no raw material was issued for it.') : t('dermat_orders.batch.noMaterials', 'No material has been asked from the store for this batch.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="batch-qc">
            <h2 id="batch-qc" className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('dermat_orders.batch.checks', 'QC checks')}
            </h2>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colAr', 'AR no. / check')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colStep', 'Step')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colTests', 'Chemical / micro')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batch.colResult', 'Result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.checks.map((check) => (
                    <tr key={check.id}>
                      <td className="px-3 py-2">
                        <Link href={`/backend/qc/checks/${check.id}`} className="font-mono hover:underline">
                          {check.arNo ?? check.code}
                        </Link>
                        {check.round > 1 ? <span className="ml-1 text-xs text-muted-foreground">{t('dermat_orders.batch.round', 'round {n}', { n: check.round })}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{check.stageKey ? stageDef(check.stageKey)?.label ?? check.stageKey : check.operation}</td>
                      <td className="px-3 py-2 text-xs">
                        {check.chemicalStatus} / {check.microStatus}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge variant={CHECK_VARIANT[check.status] ?? 'neutral'}>{check.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                  {!batch.checks.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {t('dermat_orders.batch.noChecks', 'No QC checks yet.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

export default BatchPage
