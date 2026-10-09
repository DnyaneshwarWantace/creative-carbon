"use client"

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FileSpreadsheet, PlugZap, RefreshCw, Send } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useGranted } from '../../cc_departments/components/useGranted'
import { PUSH_STATUS, type PushView } from './TallyPushPage'
import { TallyConnectionPanel, type TallySettingsView } from './TallyConnectionPanel'
import { TallyCheckPanel } from './TallyCheckPanel'

type Kind = 'sales' | 'credit_notes' | 'receipts' | 'purchases' | 'payments'
type Voucher = { type: string; date: string; number: string; reference: string | null; party: string; narration: string; entries: Array<{ ledger: string; amount: number }> }
type Summary = { counts: Record<string, number>; amounts: Record<string, number>; parties: number; vouchers: number; unbalanced: string[]; preview?: Voucher[]; fileName?: string; content?: string; inTally?: Record<string, string>; newCount?: number }
type Tab = 'send' | 'check' | 'connection'

const KINDS: Array<{ key: Kind; label: string; hint: string }> = [
  { key: 'sales', label: 'Sales invoices', hint: 'Issued tax invoices' },
  { key: 'credit_notes', label: 'Credit notes', hint: 'Against invoices' },
  { key: 'receipts', label: 'Receipts', hint: 'Advance and balance received' },
  { key: 'purchases', label: 'Purchases', hint: 'Vendor bills' },
  { key: 'payments', label: 'Vendor payments', hint: 'Payments against vendor bills' },
]

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
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const granted = useGranted()
  const canPush = granted.has('cc_accounts.tally')
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'cc-tally-page' })
  const [settings, setSettings] = React.useState<TallySettingsView | null>(null)
  const [tab, setTab] = React.useState<Tab>('send')
  const [pushes, setPushes] = React.useState<PushView[] | null>(null)

  const loadPushes = React.useCallback(async () => {
    const call = await apiCall<{ items: PushView[] }>('/api/cc_accounts/tally/pushes?pageSize=20', undefined, { fallback: { items: [] } })
    setPushes(call.result?.items ?? [])
  }, [])

  React.useEffect(() => {
    void apiCall<TallySettingsView>('/api/cc_accounts/tally/settings').then((call) => {
      if (call.ok && call.result) setSettings(call.result)
    })
    void loadPushes()
  }, [loadPushes])

  const sendToTally = async () => {
    if (!kinds.length) {
      flash(t('cc_accounts.tally.pickKind', 'Pick at least one kind of entry.'), 'error')
      return
    }
    setBusy('push')
    try {
      const body = { from, to, kinds, masters, again: [] as string[] }
      const call = await runMutation({
        context: { formId: 'cc-tally-push', resourceKind: 'cc_accounts.tally_push', resourceId: 'new', retryLastMutation },
        mutationPayload: body,
        operation: () => apiCall<PushView & { error?: string }>('/api/cc_accounts/tally/pushes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.tally.pushError', 'Could not send to Tally.'), 'error')
        return
      }
      const pushed = call.result
      if (pushed.status === 'sent') flash(t('cc_accounts.tally.pushOk', '{count} entries sent to Tally ({code})', { count: pushed.voucherCount, code: pushed.code }), 'success')
      else flash(`${pushed.code}: ${pushed.lastAttempt?.error ?? t('cc_accounts.tally.pushFailed', 'Tally did not take it')}`, 'error')
      await Promise.all([loadPushes(), run('summary')])
    } finally {
      setBusy(null)
    }
  }

  const query = (format: 'summary' | 'xml' | 'csv') => {
    const params = new URLSearchParams({ from, to, kinds: kinds.join(','), format, masters: String(masters) })
    return `/api/cc_accounts/tally?${params.toString()}`
  }

  const run = React.useCallback(async (format: 'summary' | 'xml' | 'csv') => {
    if (!kinds.length) {
      flash(t('cc_accounts.tally.pickKind', 'Pick at least one kind of entry.'), 'error')
      return
    }
    setBusy(format)
    try {
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
  }, [from, to, kinds, masters, t])

  React.useEffect(() => {
    void run('summary')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connected = settings ? (settings.mode === 'bridge' ? settings.bridgeKeySet : Boolean(settings.url)) : false

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.tally.title', 'Tally')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_accounts.tally.lede2', 'Send sales, credit notes, receipts, purchases and vendor payments to Tally. Entries already in Tally are skipped, and every send is logged with what Tally answered. No connection? Download the XML and import it in Tally (Gateway → Import → Transactions).')}</p>
            </div>
            {tab === 'send' ? (
            <div className="flex shrink-0 flex-wrap gap-2 xl:flex-nowrap">
              <Button type="button" variant="outline" onClick={() => void run('summary')} disabled={Boolean(busy)}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.tally.preview', 'Preview')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void run('csv')} disabled={Boolean(busy)}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.tally.csv', 'Day book (CSV)')}
              </Button>
              <Button type="button" variant={canPush && connected ? 'outline' : 'default'} onClick={() => void run('xml')} disabled={Boolean(busy)}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy === 'xml' ? t('cc_accounts.tally.preparing', 'Preparing…') : t('cc_accounts.tally.xml', 'Download Tally XML')}
              </Button>
              {canPush ? (
                <Button type="button" onClick={() => void sendToTally()} disabled={Boolean(busy) || !connected || summary?.newCount === 0} title={connected ? undefined : t('cc_accounts.tally.needConnection', 'Set up the connection first (Connection tab)')}>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {busy === 'push' ? t('cc_accounts.tally.sending', 'Sending…') : summary?.newCount === 0 ? t('cc_accounts.tally.nothingNew', 'Nothing new to send') : summary?.newCount != null ? t('cc_accounts.tally.sendCount', 'Send {count} to Tally', { count: summary.newCount }) : t('cc_accounts.tally.send', 'Send to Tally')}
                </Button>
              ) : null}
            </div>
            ) : null}
          </header>

          <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label={t('cc_accounts.tally.tabs', 'Tally')}>
            {(
              [
                ['send', t('cc_accounts.tally.tabSend', 'Send to Tally')],
                ['check', t('cc_accounts.tally.tabCheck', 'Check against Tally')],
                ['connection', t('cc_accounts.tally.tabConnection', 'Connection')],
              ] as Array<[Tab, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === value ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {label}
                {value === 'connection' && settings && !connected ? <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-status-warning-icon" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>

          {tab === 'connection' && settings ? <TallyConnectionPanel settings={settings} canEdit={canPush} onChanged={setSettings} /> : null}
          {tab === 'check' ? <TallyCheckPanel from={from} to={to} kinds={kinds} /> : null}

          {tab === 'send' ? (
          <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="space-y-4 rounded-lg border bg-card p-5">
              <h2 className="text-sm font-semibold">{t('cc_accounts.tally.what', 'What to export')}</h2>
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

            <section className="space-y-3 rounded-lg border bg-card p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <PlugZap className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t('cc_accounts.tally.connectionTitle', 'Connection')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {!settings
                      ? '…'
                      : settings.mode === 'bridge'
                        ? settings.bridgeAlive
                          ? t('cc_accounts.tally.statusBridgeOn', 'Through the bridge on the accounts PC (running){url}', { url: settings.bridgeTallyUrl ? ` → ${settings.bridgeTallyUrl}` : '' })
                          : t('cc_accounts.tally.statusBridgeOff', 'Through the bridge on the accounts PC (not running now)')
                        : settings.url
                          ? t('cc_accounts.tally.statusDirect', 'Direct to {url}', { url: settings.url })
                          : t('cc_accounts.tally.statusNone', 'Not set up yet. You can still download the XML and import it in Tally.')}
                  </p>
                  {settings?.company ? <p className="text-xs text-muted-foreground">{t('cc_accounts.tally.statusCompany', 'Company in Tally: {name}', { name: settings.company })}</p> : null}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setTab('connection')}>
                  {connected ? t('cc_accounts.tally.change', 'Change / test') : t('cc_accounts.tally.setUp', 'Set up')}
                </Button>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>{t('cc_accounts.tally.rule1', 'Before sending, the ledgers are read from Tally: missing tax, sales or bank ledgers stop the send; missing customers and vendors are created.')}</li>
                <li>{t('cc_accounts.tally.rule2', 'Every voucher carries its own ERP id, so sending again updates it in Tally instead of making a copy.')}</li>
                <li>{t('cc_accounts.tally.rule3', 'Use “Check against Tally” any time to see what reached Tally and what was entered only in Tally.')}</li>
              </ul>
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
                          <td className="px-3 py-2 font-mono text-xs">
                            {voucher.number}
                            {summary.inTally?.[`${voucher.type}:${voucher.number}`] ? (
                              <span className="mt-1 flex items-center gap-1 font-sans text-status-success-text">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                {t('cc_accounts.tally.inTally', 'In Tally ({code})', { code: summary.inTally[`${voucher.type}:${voucher.number}`] })}
                              </span>
                            ) : null}
                          </td>
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

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('cc_accounts.tally.history', 'Sent to Tally')}</h2>
            {!pushes ? null : !pushes.length ? (
              <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t('cc_accounts.tally.noPushes', 'Nothing sent yet. Set the Tally address, preview, then Send to Tally.')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.push', 'Push')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.sentAt', 'Sent')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.dates', 'Dates')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.tally.entriesCol', 'Entries')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.status', 'Status')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.tally.by', 'By')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pushes.map((push) => (
                      <tr key={push.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link className="text-primary hover:underline" href={`/backend/accounts/tally/${push.id}`}>
                            {push.code}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{new Date(push.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{push.rangeFrom} – {push.rangeTo}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{push.voucherCount}</td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={PUSH_STATUS[push.status].variant} dot>
                            {t(`cc_accounts.push.status.${push.status}`, PUSH_STATUS[push.status].label)}
                          </StatusBadge>
                          {push.status !== 'sent' && push.lastAttempt?.error ? <span className="mt-0.5 block max-w-xs truncate text-xs text-muted-foreground">{push.lastAttempt.error}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{push.pushedByName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          </>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}
