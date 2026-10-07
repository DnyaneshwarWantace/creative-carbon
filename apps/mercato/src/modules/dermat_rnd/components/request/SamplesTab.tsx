"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { Send } from 'lucide-react'
import { CodeLink } from '../shared/CodeLink'
import { dayText } from '../labels'
import type { Round } from '../types'

type SamplesTabProps = { rounds: Round[]; onOpenTrial: (trialId: string) => void }

export function SamplesTab({ rounds, onOpenTrial }: SamplesTabProps) {
  const t = useT()
  if (!rounds.length) {
    return <EmptyState icon={<Send className="size-5" aria-hidden="true" />} title={t('dermat_rnd.samples.empty', 'No sample sent yet')} description={t('dermat_rnd.samples.emptyHint', 'Use Sample sent when a trial goes to the client.')} />
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.round', 'Round')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.trial', 'Trial')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.sent', 'Sent')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.via', 'Via')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.result', 'Client')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_rnd.samples.feedback', 'What the client said')}</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.round} className="border-t align-top">
              <td className="px-3 py-2 tabular-nums">{round.round}</td>
              <td className="px-3 py-2">
                {round.trialId && round.trialCode ? (
                  <CodeLink code={round.trialCode} onClick={() => onOpenTrial(round.trialId as string)} />
                ) : (
                  '—'
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{dayText(round.sentOn)}</td>
              <td className="px-3 py-2">{round.sentVia ?? '—'}</td>
              <td className="px-3 py-2">
                {round.result ? (
                  <StatusBadge variant={round.result === 'approved' ? 'success' : 'warning'}>{round.result === 'approved' ? t('dermat_rnd.ok', 'Approved') : t('dermat_rnd.changes', 'Changes')}</StatusBadge>
                ) : (
                  <span className="text-status-warning-text">{t('dermat_rnd.waiting', 'Waiting')}</span>
                )}
              </td>
              <td className="px-3 py-2">{round.feedback ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
