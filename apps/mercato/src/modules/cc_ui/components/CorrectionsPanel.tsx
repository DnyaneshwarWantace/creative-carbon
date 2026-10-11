"use client"

import * as React from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type Correction = { id: string; recordLabel: string; recordName: string | null; href: string | null; action: string; summary: string | null; reason: string | null; by: string | null; at: string }
type Corrections = { count: number; people: Array<{ name: string; count: number }>; items: Correction[] }

export function CorrectionsPanel({ scope, days = 7 }: { scope: 'plant' | 'crm'; days?: number }) {
  const t = useT()
  const [data, setData] = React.useState<Corrections | null>(null)
  React.useEffect(() => {
    void apiCall<Corrections>(`/api/cc_audit/corrections?scope=${scope}&days=${days}`, undefined, { fallback: { count: 0, people: [], items: [] } }).then((call) => setData(call.result ?? { count: 0, people: [], items: [] }))
  }, [days, scope])
  if (!data) return null
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs" data-testid={`corrections-${scope}`}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t('cc_ui.corrections.title', 'Corrections this week')}
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{data.count}</span>
      </h2>
      {data.count === 0 ? (
        <p className="text-sm text-muted-foreground">{t('cc_ui.corrections.none', 'Nothing was corrected in the last 7 days.')}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{data.people.map((person) => `${person.name} ${person.count}`).join(' · ')}</p>
          <ul className="space-y-1.5 text-sm">
            {data.items.slice(0, 12).map((item) => {
              const label = `${item.recordLabel}${item.recordName ? ` ${item.recordName}` : ''}`
              return (
                <li key={item.id} className="min-w-0">
                  {item.href ? <Link className="font-medium underline-offset-2 hover:underline" href={item.href}>{label}</Link> : <span className="font-medium">{label}</span>}
                  <span className="text-muted-foreground"> · {item.action.replace(/_/g, ' ')}{item.by ? ` · ${item.by}` : ''}</span>
                  {item.reason ? <p className="truncate text-xs text-muted-foreground">{item.reason}</p> : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
