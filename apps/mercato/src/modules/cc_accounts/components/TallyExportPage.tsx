"use client"

import * as React from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type Kind = 'sales' | 'credit_notes' | 'receipts' | 'purchases' | 'payments'
type Voucher = { type: string; date: string; number: string; reference: string | null; party: string; narration: string; entries: Array<{ ledger: string; amount: number }> }
type Summary = { counts: Record<string, number>; amounts: Record<string, number>; parties: number; vouchers: number; unbalanced: string[]; preview?: Voucher[]; fileName?: string; content?: string }

const KINDS: Array<{ key: Kind; label: string; hint: string }> = [
  { key: 'sales', label: 'Sales invoices', hint: 'Issued tax invoices' },
  { key: 'credit_notes', label: 'Credit notes', hint: 'Against invoices' },
  { key: 'receipts', label: 'Receipts', hint: 'Advance and balance received' },
  { key: 'purchases', label: 'Purchases', hint: 'Vendor bills' },
  { key: 'payments', label: 'Vendor payments', hint: 'Payments against vendor bills' },
]

const LEDGER_FIELDS: Array<{ key: string; label: string; fallback: string }> = [
  { key: 'sales', label: 'Sales ledger', fallback: 'Sales @ GST' },
  { key: 'purchase', label: 'Purchase ledger', fallback: 'Purchase @ GST' },
  { key: 'outputCgst', label: 'Output CGST', fallback: 'Output CGST' },
  { key: 'outputSgst', label: 'Output SGST', fallback: 'Output SGST' },
  { key: 'outputIgst', label: 'Output IGST', fallback: 'Output IGST' },
  { key: 'inputCgst', label: 'Input CGST', fallback: 'Input CGST' },
  { key: 'inputSgst', label: 'Input SGST', fallback: 'Input SGST' },
  { key: 'inputIgst', label: 'Input IGST', fallback: 'Input IGST' },
  { key: 'bank', label: 'Bank ledger', fallback: 'Bank Account' },
  { key: 'roundOff', label: 'Round off ledger', fallback: 'Round Off' },
]

const STORAGE_KEY = 'cc-tally-ledgers'

function monthStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA')
}

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function rupees(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function saveFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function TallyExportPage() {
  const t = useT()
  const [from, setFrom] = React.useState(monthStart())
  const [to, setTo] = React.useState(today())
  const [kinds, setKinds] = React.useState<Kind[]>(KINDS.map((kind) => kind.key))
  const [masters, setMasters] = React.useState(true)
  const [ledgers, setLedgers] = React.useState<Record<string, string>>(() => Object.fromEntries(LEDGER_FIELDS.map((field) => [field.key, field.fallback])))
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setLedgers((prev) => ({ ...prev, ...(JSON.parse(saved) as Record<string, string>) }))
    } catch {
      return
    }
  }, [])

  const query = (format: 'summary' | 'xml' | 'csv') => {
    const params = new URLSearchParams({ from, to, kinds: kinds.join(','), format, masters: String(masters) })
    for (const [key, value] of Object.entries(ledgers)) if (value.trim()) params.set(`ledger_${key}`, value.trim())
    return `/api/cc_accounts/tally?${params.toString()}`
  }

  const run = React.useCallback(async (format: 'summary' | 'xml' | 'csv') => {
    if (!kinds.length) {
      flash(t('cc_accounts.tally.pickKind', 'Pick at least one kind of entry.'), 'error')
      return
    }
    setBusy(format)
    try {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledgers))
      } catch {
        void 0
      }
      const call = await apiCall<Summary & { error?: string }>(query(format))
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.tally.error', 'Could not prepare the export.'), 'error')
        return
      }
      setSummary(call.result)
      if (format !== 'summary') {
        if (!call.result.vouchers) {
          flash(t('cc_accounts.tally.empty', 'Nothing to export in these dates.'), 'error')
          return
        }
        saveFile(call.result.fileName ?? `tally.${format}`, call.result.content ?? '', format === 'xml' ? 'application/xml' : 'text/csv')
        flash(t('cc_accounts.tally.saved', '{count} entries exported.', { count: call.result.vouchers }), 'success')
      }
    } finally {
      setBusy(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, kinds, masters, ledgers, t])

  React.useEffect(() => {
    void run('summary')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.tally.title', 'Tally export')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_accounts.tally.lede', 'Take sales, receipts, purchases and vendor payments into Tally. In Tally: Gateway → Import → Transactions, pick the XML file. Customer and vendor ledgers are created too when "Include ledgers" is on.')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void run('summary')} disabled={Boolean(busy)}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.tally.preview', 'Preview')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void run('csv')} disabled={Boolean(busy)}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.tally.csv', 'Day book (CSV)')}
              </Button>
              <Button type="button" onClick={() => void run('xml')} disabled={Boolean(busy)}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy === 'xml' ? t('cc_accounts.tally.preparing', 'Preparing…') : t('cc_accounts.tally.xml', 'Download Tally XML')}
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="space-y-4 rounded-lg border bg-card p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tally-from">{t('cc_accounts.tally.from', 'From')}</Label>
                  <Input id="tally-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tally-to">{t('cc_accounts.tally.to', 'To')}</Label>
                  <Input id="tally-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                {KINDS.map((kind) => (
                  <label key={kind.key} htmlFor={`tally-kind-${kind.key}`} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox id={`tally-kind-${kind.key}`} checked={kinds.includes(kind.key)} onCheckedChange={(checked) => setKinds((prev) => (checked === true ? [...prev, kind.key] : prev.filter((entry) => entry !== kind.key)))} />
                    <span>
                      <span className="font-medium">{kind.label}</span>
                      <span className="block text-xs text-muted-foreground">{kind.hint}</span>
                    </span>
                  </label>
                ))}
                <label htmlFor="tally-masters" className="flex cursor-pointer items-start gap-2 border-t pt-2 text-sm">
                  <Checkbox id="tally-masters" checked={masters} onCheckedChange={(checked) => setMasters(checked === true)} />
                  <span>
                    <span className="font-medium">{t('cc_accounts.tally.masters', 'Include ledgers')}</span>
                    <span className="block text-xs text-muted-foreground">{t('cc_accounts.tally.mastersHint', 'Customers under Sundry Debtors, vendors under Sundry Creditors, with GSTIN and state')}</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 lg:col-span-2">
              <h2 className="text-sm font-semibold">{t('cc_accounts.tally.ledgers', 'Ledger names in your Tally')}</h2>
              <p className="mb-3 text-xs text-muted-foreground">{t('cc_accounts.tally.ledgersHint', 'Write them exactly as they are in Tally. They are remembered on this computer.')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {LEDGER_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={`tally-ledger-${field.key}`} className="text-xs text-muted-foreground">{field.label}</Label>
                    <Input id={`tally-ledger-${field.key}`} value={ledgers[field.key] ?? ''} onChange={(event) => setLedgers((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {summary ? (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {['Sales', 'Credit Note', 'Receipt', 'Purchase', 'Payment'].map((type) => (
                  <div key={type} className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <p className="text-lg font-semibold tabular-nums">{summary.counts[type] ?? 0}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{rupees(summary.amounts[type] ?? 0)}</p>
                  </div>
                ))}
              </div>
              {summary.unbalanced.length ? (
                <Alert status="warning" style="lighter">
                  <AlertTitle>{t('cc_accounts.tally.unbalanced', 'Some entries do not balance')}</AlertTitle>
                  <AlertDescription>{summary.unbalanced.join(', ')}</AlertDescription>
                </Alert>
              ) : null}
              {summary.preview?.length ? (
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.date', 'Date')}</th>
                        <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.type', 'Type')}</th>
                        <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.number', 'No.')}</th>
                        <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.party', 'Party')}</th>
                        <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.entries', 'Ledger entries (Dr / Cr)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.preview.map((voucher) => (
                        <tr key={`${voucher.type}-${voucher.number}`} className="align-top">
                          <td className="px-3 py-2 tabular-nums">{voucher.date}</td>
                          <td className="px-3 py-2">{voucher.type}</td>
                          <td className="px-3 py-2 font-mono text-xs">{voucher.number}</td>
                          <td className="px-3 py-2">{voucher.party}</td>
                          <td className="px-3 py-2 text-xs">
                            {voucher.entries.map((entry) => (
                              <div key={entry.ledger} className="flex justify-between gap-4 tabular-nums">
                                <span>{entry.ledger}</span>
                                <span>{entry.amount < 0 ? `Dr ${rupees(-entry.amount)}` : `Cr ${rupees(entry.amount)}`}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t('cc_accounts.tally.none', 'No entries in these dates.')}</p>
              )}
            </section>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}
