'use client'

import * as React from 'react'
import Link from 'next/link'
import { Factory, FileStack, FlaskConical, Lock, PackageCheck, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { stageDef } from '../lib/stages'
import { STAGE_VARIANT, formatDate, formatDateTime, formatQty } from './format'
import type { OrderFileData } from './OrderFile'

const RUN_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  manufacturing: Factory,
  filling: FlaskConical,
  packing: PackageCheck,
  qc_qa: FileStack,
  dispatch: Truck,
}

const QC_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = { passed: 'success', approved: 'success', failed: 'error', rejected: 'error', pending: 'warning' }

function BomChip({ bom, label }: { bom: { id: string; version: number; orderSpecific: boolean } | null; label: string }) {
  const t = useT()
  if (!bom) return <span className="text-xs text-status-warning-text">{t('dermat_orders.record.noBom', '{label}: none', { label })}</span>
  return (
    <Link href={`/backend/boms/${bom.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted">
      <FileStack className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">v{bom.version}</span>
      {bom.orderSpecific ? <span className="rounded-sm bg-status-info-bg px-1 text-status-info-text">{t('dermat_orders.record.forThisOrder', 'for this order')}</span> : null}
    </Link>
  )
}

export function OrderRecord({ file }: { file: OrderFileData | null }) {
  const t = useT()
  if (!file) return <LoadingMessage label={t('dermat_orders.record.loading', 'Loading the order record…')} />
  const { record } = file
  const byStage = new Map<string, typeof record.lots>()
  for (const lot of record.lots) byStage.set(lot.stage, [...(byStage.get(lot.stage) ?? []), lot])

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
            <span className="flex items-center gap-2">
              <FileStack className="h-4 w-4 text-primary" />
              {t('dermat_orders.record.boms', 'Formula and pack BOM used')}
            </span>
            {record.boms.frozen ? (
              <span className="flex items-center gap-1 text-xs font-normal text-status-success-text">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('dermat_orders.record.frozen', 'Locked when Manufacturing was done · {when}{by}', { when: formatDateTime(record.boms.at ?? ''), by: record.boms.by ? ` · ${record.boms.by}` : '' })}
              </span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">{t('dermat_orders.record.notFrozen', 'Current BOMs. They are locked to this order when Manufacturing is done.')}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {record.boms.lines.map((line) => (
            <div key={line.lineId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0 text-sm font-medium">{line.title}</span>
              <span className="flex flex-wrap items-center gap-2">
                <BomChip bom={line.pack} label={t('dermat_orders.record.pack', 'Pack BOM')} />
                {line.bulkId ? <BomChip bom={line.formula} label={line.bulkTitle ? t('dermat_orders.record.formulaOf', 'Formula · {bulk}', { bulk: line.bulkTitle }) : t('dermat_orders.record.formula', 'Formula')} /> : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="text-sm font-bold">{t('dermat_orders.record.lots', 'Material batches used ({count})', { count: record.lots.length })}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('dermat_orders.record.lotsHint', 'Every batch the store issued for this order, and where it came from.')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {record.lots.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('dermat_orders.record.material', 'Material')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('dermat_orders.record.batch', 'Batch')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('dermat_orders.record.qty', 'Issued')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('dermat_orders.record.from', 'Came from')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('dermat_orders.record.expiry', 'Mfg / expiry')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('dermat_orders.record.inwardQc', 'Inward QC')}</th>
                  </tr>
                </thead>
                {Array.from(byStage.entries()).map(([stageKey, lots]) => (
                  <tbody key={stageKey} className="divide-y border-t">
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        {t('dermat_orders.record.forStage', 'Issued for {stage}', { stage: stageDef(stageKey)?.label ?? stageKey })}
                      </td>
                    </tr>
                    {lots.map((lot, index) => (
                      <tr key={`${lot.productId}-${lot.lotNumber}-${index}`} className="align-top">
                        <td className="px-3 py-2">
                          <span className="block font-mono text-xs text-muted-foreground">{lot.code}</span>
                          <span>{lot.title}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{lot.lotNumber}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatQty(lot.quantity, 3)} <span className="text-xs text-muted-foreground">{lot.unit}</span>
                          <span className="block text-xs text-muted-foreground">{lot.request}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {lot.grn ? (
                            <>
                              <Link href={`/backend/purchase/grns/${lot.grn.id}`} className="font-mono font-medium text-primary hover:underline">
                                {lot.grn.code}
                              </Link>
                              <span className="block text-muted-foreground">{[lot.grn.vendorName, lot.grn.date ? formatDate(lot.grn.date) : null].filter(Boolean).join(' · ')}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t('dermat_orders.record.noGrn', 'Opening stock or made in-house')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {lot.mfgDate || lot.expiryDate ? `${lot.mfgDate ? formatDate(lot.mfgDate) : '—'} / ${lot.expiryDate ? formatDate(lot.expiryDate) : '—'}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {lot.qc ? (
                            <Link href={`/backend/qc/checks/${lot.qc.id}`} className="inline-flex flex-wrap items-center gap-1.5 hover:underline">
                              <span className="font-mono">{lot.qc.code}</span>
                              {lot.qc.status ? <StatusBadge variant={QC_VARIANT[lot.qc.status] ?? 'neutral'}>{lot.qc.status}</StatusBadge> : null}
                              {lot.qc.arNo ? <span className="text-muted-foreground">AR {lot.qc.arNo}</span> : null}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('dermat_orders.record.noLots', 'Nothing has been issued by the store for this order yet.')}</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="text-sm font-bold">{t('dermat_orders.record.runs', 'Production, release and dispatch')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {record.runs.map((run) => {
            const Icon = RUN_ICON[run.key] ?? Factory
            const waiting = run.status === 'waiting'
            return (
              <section key={run.key} className={cn('space-y-2 rounded-lg border p-3', waiting && 'border-dashed opacity-60')}>
                <header className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {run.label}
                  </span>
                  <StatusBadge variant={STAGE_VARIANT[run.status] ?? 'neutral'} dot>
                    {t(`dermat_orders.stageStatus.${run.status}`, run.status.replace('_', ' '))}
                  </StatusBadge>
                </header>
                {run.fields.length ? (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {run.fields.map((field) => (
                      <React.Fragment key={field.key}>
                        <dt className="text-muted-foreground">{field.label}</dt>
                        <dd className="break-words">{field.value}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">{waiting ? t('dermat_orders.record.notYet', 'Not reached yet.') : t('dermat_orders.record.noDetails', 'No details entered yet.')}</p>
                )}
                {run.completedAt ? (
                  <p className="text-xs text-muted-foreground">{t('dermat_orders.record.doneBy', 'Done {when}{by}', { when: formatDateTime(run.completedAt), by: run.completedByName ? ` · ${run.completedByName}` : '' })}</p>
                ) : null}
              </section>
            )
          })}
        </CardContent>
      </Card>

      {file.qc.length ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <CardTitle className="text-sm font-bold">{t('dermat_orders.record.qc', 'QC tests on this order ({count})', { count: file.qc.length })}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {file.qc.map((check) => {
              const outOfSpec = check.results.filter((result) => result.inSpec === false).length
              return (
                <Link key={check.id} href={`/backend/qc/checks/${check.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{check.code}</span>
                    <span className="ml-2">{check.productTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[stageDef(check.stageKey ?? '')?.label, check.batchNo ? `Batch ${check.batchNo}` : null, check.arNo ? `AR ${check.arNo}` : null, check.round > 1 ? `Round ${check.round}` : null, t('dermat_orders.record.params', '{count} parameters', { count: check.results.length }), outOfSpec ? t('dermat_orders.record.outOfSpec', '{count} out of spec', { count: outOfSpec }) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusBadge variant={QC_VARIANT[check.status] ?? 'neutral'}>{check.status}</StatusBadge>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
