"use client"

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { CodeLink } from '../shared/CodeLink'
import { KeyValueList } from '../shared/KeyValueList'
import { Section } from '../shared/Section'
import { STABILITY_STATUS, TRIAL_STATUS, dayText } from '../labels'
import type { RdRequest, Trial } from '../types'

type RequestOverviewProps = { request: RdRequest; trials: Trial[]; onOpenTrial: (trialId: string) => void }

export function RequestOverview({ request, trials, onOpenTrial }: RequestOverviewProps) {
  const t = useT()
  const approved = trials.find((trial) => trial.id === request.approvedTrialId) ?? null
  const latest = trials[trials.length - 1] ?? null

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Section className="xl:col-span-2" title={t('dermat_rnd.overview.request', 'Batch request')} hint={t('dermat_rnd.overview.requestHint', 'What Sales asked R&D to make')}>
        <div className="flex flex-col gap-4">
          <KeyValueList
            rows={[
              { label: t('dermat_rnd.type', 'Product type'), value: request.productType },
              { label: t('dermat_rnd.pack', 'Pack size'), value: request.packSize },
              { label: t('dermat_rnd.textureReference', 'Texture reference'), value: request.textureReference },
              { label: t('dermat_rnd.texture', 'Texture'), value: request.texture },
              { label: t('dermat_rnd.fragrance', 'Fragrance'), value: request.fragrance },
              { label: t('dermat_rnd.colour', 'Colour'), value: request.colour },
              { label: t('dermat_rnd.targetPh', 'Target pH'), value: request.targetPh },
              { label: t('dermat_rnd.claims', 'Claims'), value: request.claims },
              { label: t('dermat_rnd.sampleQty', 'Sample quantity'), value: request.sampleQty },
              { label: t('dermat_rnd.dueDate', 'Sample needed by'), value: request.dueDate ? dayText(request.dueDate) : null },
              { label: t('dermat_rnd.clientInstruction', "Client's instruction"), value: request.clientInstruction, wide: true },
              { label: t('dermat_rnd.notes', 'Notes'), value: request.notes, wide: true },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">{t('dermat_rnd.ingredientsWanted', 'Ingredients the client wants')}</p>
            {request.ingredientRefs.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {request.ingredientRefs.map((item) => (
                  <li key={item.productId} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
                    {item.code ? <span className="mr-1 font-mono text-muted-foreground">{item.code}</span> : null}
                    {item.name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="whitespace-pre-line text-sm">{request.ingredients || (request.ingredientRefs.length ? '' : '—')}</p>
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-4">
        <Section title={t('dermat_rnd.overview.formula', 'Formula')}>
          {approved ? (
            <div className="flex flex-col gap-2 text-sm">
              <CodeLink code={approved.code} onClick={() => onOpenTrial(approved.id)} />
              <p className="text-muted-foreground">{t('dermat_rnd.overview.approvedBy', 'Approved formula · {chemist} · {date}', { chemist: approved.chemistName ?? '—', date: dayText(approved.batchDate) })}</p>
              <StatusBadge variant={STABILITY_STATUS[approved.stabilityStatus].variant}>{t(STABILITY_STATUS[approved.stabilityStatus].key, STABILITY_STATUS[approved.stabilityStatus].fallback)}</StatusBadge>
              {request.bomId ? (
                <Link href={`/backend/boms/${request.bomId}`} className="w-fit text-primary hover:underline">
                  {t('dermat_rnd.overview.openBom', 'Open the BOM')}
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">{t('dermat_rnd.overview.noBom', 'No BOM yet. Use Make BOM on the approved trial.')}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('dermat_rnd.overview.noFormula', 'No approved formula yet.')}</p>
          )}
        </Section>
        <Section title={t('dermat_rnd.overview.progress', 'Progress')}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t('dermat_rnd.overview.trials', 'Trials')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{trials.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('dermat_rnd.overview.samples', 'Samples sent')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{request.rounds.length}</dd>
            </div>
            {latest ? (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">{t('dermat_rnd.overview.latest', 'Latest trial')}</dt>
                <dd className="flex items-center gap-2">
                  <CodeLink code={latest.code} onClick={() => onOpenTrial(latest.id)} />
                  <StatusBadge variant={TRIAL_STATUS[latest.status].variant}>{t(TRIAL_STATUS[latest.status].key, TRIAL_STATUS[latest.status].fallback)}</StatusBadge>
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>
      </div>
    </div>
  )
}
