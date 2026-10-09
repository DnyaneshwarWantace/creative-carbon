"use client"

import * as React from 'react'
import Link from 'next/link'
import { ScanSearch } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { recordHref } from '../../cc_ui/lib/links'

type Status = 'matched' | 'amount_differs' | 'not_in_tally' | 'only_in_tally' | 'cancelled_in_tally'
type Row = { key: string; date: string; type: string; number: string; party: string; erpAmount: number | null; tallyAmount: number | null; status: Status; recordId: string | null; pushCode: string | null }
type Result = { via: 'direct' | 'bridge'; counts: Partial<Record<Status, number>>; rows: Row[] }

const STATUS: Record<Status, { label: string; variant: StatusBadgeVariant }> = {
  matched: { label: 'In both', variant: 'success' },
  amount_differs: { label: 'Amount differs', variant: 'error' },
  not_in_tally: { label: 'Not in Tally', variant: 'warning' },
  only_in_tally: { label: 'Only in Tally', variant: 'info' },
  cancelled_in_tally: { label: 'Cancelled in Tally', variant: 'neutral' },
}

function money(value: number | null): string {
  return value == null ? '—' : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function href(row: Row): string | null {
  if (!row.recordId) return null
  if (row.type === 'Sales' || row.type === 'Credit Note') return recordHref.invoice(row.recordId)
  if (row.type === 'Receipt') return recordHref.payment(row.recordId)
  return recordHref.vendorBill(row.recordId)
}

export function TallyCheckPanel({ from: initialFrom, to: initialTo, kinds }: { from: string; to: string; kinds: string[] }) {
  const t = useT()
  const [from, setFrom] = React.useState(initialFrom)
  const [to, setTo] = React.useState(initialTo)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const [filter, setFilter] = React.useState<Status | 'problems' | 'all'>('problems')

  const run = async () => {
    setBusy(true)
    try {
      const call = await apiCall<Result & { error?: string }>(`/api/cc_accounts/tally/check?${new URLSearchParams({ from, to, kinds: kinds.join(',') }).toString()}`)
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.check.error', 'Could not read from Tally.'), 'error')
        return
      }
      setResult(call.result)
    } finally {
      setBusy(false)
    }
  }

  const rows = (result?.rows ?? []).filter((row) => (filter === 'all' ? true : filter === 'problems' ? row.status !== 'matched' : row.status === filter))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-sm font-semibold">{t('cc_accounts.check.title', 'Check against Tally')}</h2>
          <p className="text-xs text-muted-foreground">{t('cc_accounts.check.hint', 'Reads the vouchers back from Tally and matches them with the ERP: what is in both, what never reached Tally, amounts that differ, and entries made only in Tally.')}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="check-from" className="text-xs text-muted-foreground">{t('cc_accounts.tally.from', 'From')}</Label>
          <Input id="check-from" type="date" className="w-40" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="check-to" className="text-xs text-muted-foreground">{t('cc_accounts.tally.to', 'To')}</Label>
          <Input id="check-to" type="date" className="w-40" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <Button type="button" onClick={() => void run()} disabled={busy}>
          <ScanSearch className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {busy ? t('cc_accounts.tally.testing', 'Talking to Tally…') : t('cc_accounts.check.run', 'Check now')}
        </Button>
      </div>

      {result ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('cc_accounts.check.filter', 'Show')}>
            {(['problems', 'all', ...Object.keys(STATUS)] as Array<Status | 'problems' | 'all'>).map((value) => {
              const count = value === 'all' ? result.rows.length : value === 'problems' ? result.rows.filter((row) => row.status !== 'matched').length : (result.counts[value] ?? 0)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium', filter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
                >
                  {value === 'problems' ? t('cc_accounts.check.problems', 'Needs a look') : value === 'all' ? t('cc_accounts.check.all', 'All') : t(`cc_accounts.check.status.${value}`, STATUS[value].label)}
                  <span className={cn('rounded-full px-1.5 tabular-nums', filter === value ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
                </button>
              )
            })}
          </div>
          {rows.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.date', 'Date')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.type', 'Type')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.number', 'No.')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.party', 'Party')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.check.erp', 'In ERP')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.check.tally', 'In Tally')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const link = href(row)
                    return (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.date}</td>
                        <td className="px-3 py-2">{row.type}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {link ? (
                            <Link className="text-primary hover:underline" href={link}>
                              {row.number}
                            </Link>
                          ) : (
                            row.number
                          )}
                          {row.pushCode ? <span className="block font-sans text-muted-foreground">{row.pushCode}</span> : null}
                        </td>
                        <td className="px-3 py-2">{row.party}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row.erpAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row.tallyAmount)}</td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={STATUS[row.status].variant} dot>
                            {t(`cc_accounts.check.status.${row.status}`, STATUS[row.status].label)}
                          </StatusBadge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState className="rounded-lg border bg-card py-10" variant="subtle" icon={<ScanSearch className="h-5 w-5" aria-hidden="true" />} title={filter === 'problems' ? t('cc_accounts.check.allGood', 'Everything in these dates matches Tally') : t('cc_accounts.check.none', 'Nothing here')} />
          )}
        </>
      ) : null}
    </section>
  )
}

export default TallyCheckPanel
