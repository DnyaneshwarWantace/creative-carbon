"use client"

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Copy, Download, KeyRound, Laptop, Network, PlugZap, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'

export type TallySettingsView = {
  mode: 'direct' | 'bridge'
  url: string | null
  company: string | null
  ledgers: Record<string, string>
  bridgeKeySet: boolean
  bridgeSeenAt: string | null
  bridgeAlive: boolean
  bridgeTallyUrl: string | null
  hasCompany: boolean
}

export type ConnectionTest = { ok: boolean; via: 'direct' | 'bridge'; error: string | null; companies: string[]; companyFound: boolean; ledgers: string[]; missing: string[] }

export const LEDGER_FIELDS: Array<{ key: string; label: string; fallback: string }> = [
  { key: 'sales', label: 'Sales ledger', fallback: 'Sales @ GST' },
  { key: 'exportSales', label: 'Export sales ledger', fallback: 'Export Sales' },
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

const LEDGER_GROUPS = [
  { key: 'sales', title: 'Sales', keys: ['sales', 'exportSales', 'outputCgst', 'outputSgst', 'outputIgst'] },
  { key: 'purchase', title: 'Purchase', keys: ['purchase', 'inputCgst', 'inputSgst', 'inputIgst'] },
  { key: 'other', title: 'Bank & other', keys: ['bank', 'roundOff'] },
]

function download(file: 'script' | 'windows') {
  const link = document.createElement('a')
  link.href = `/api/cc_accounts/tally/bridge/download?file=${file}`
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function ago(value: string | null): string {
  if (!value) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function TallyConnectionPanel({ settings, canEdit, onChanged }: { settings: TallySettingsView; canEdit: boolean; onChanged: (next: TallySettingsView) => void }) {
  const t = useT()
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'cc-tally-connection' })
  const [mode, setMode] = React.useState(settings.mode)
  const [url, setUrl] = React.useState(settings.url ?? '')
  const [company, setCompany] = React.useState(settings.company ?? '')
  const [ledgers, setLedgers] = React.useState<Record<string, string>>(() => ({ ...Object.fromEntries(LEDGER_FIELDS.map((field) => [field.key, field.fallback])), ...settings.ledgers }))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [test, setTest] = React.useState<ConnectionTest | null>(null)
  const [key, setKey] = React.useState<{ key: string; erpUrl: string } | null>(null)
  const dirty = mode !== settings.mode || url !== (settings.url ?? '') || company !== (settings.company ?? '') || LEDGER_FIELDS.some((field) => (ledgers[field.key] ?? '') !== (settings.ledgers[field.key] ?? field.fallback))
  const tallyNames = React.useMemo(() => new Set((test?.ledgers ?? []).map((name) => name.trim().toLowerCase())), [test])

  const save = async (): Promise<TallySettingsView | null> => {
    setBusy('save')
    try {
      const body = { mode, url: url.trim() || null, company: company.trim() || null, ledgers }
      const call = await runMutation({
        context: { formId: 'cc-tally-settings', resourceKind: 'cc_accounts.tally_settings', resourceId: 'tally-settings', retryLastMutation },
        mutationPayload: body,
        operation: () => apiCall<TallySettingsView & { error?: string }>('/api/cc_accounts/tally/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.tally.settingsError', 'Could not save the Tally settings.'), 'error')
        return null
      }
      onChanged(call.result)
      setUrl(call.result.url ?? '')
      flash(t('cc_accounts.tally.settingsSaved', 'Tally settings saved'), 'success')
      return call.result
    } finally {
      setBusy(null)
    }
  }

  const runTest = async () => {
    if (dirty && canEdit && !(await save())) return
    setBusy('test')
    try {
      const call = await apiCall<ConnectionTest & { error?: string }>('/api/cc_accounts/tally/connection', { method: 'POST' })
      if (!call.result) {
        flash(t('cc_accounts.tally.testError', 'Could not test the connection.'), 'error')
        return
      }
      if (!call.ok) {
        setTest({ ok: false, via: mode, error: call.result.error ?? null, companies: [], companyFound: false, ledgers: [], missing: [] })
        return
      }
      setTest(call.result)
    } finally {
      setBusy(null)
    }
  }

  const makeKey = async () => {
    setBusy('key')
    try {
      const call = await runMutation({
        context: { formId: 'cc-tally-bridge-key', resourceKind: 'cc_accounts.tally_settings', resourceId: 'tally-bridge-key', retryLastMutation },
        mutationPayload: {},
        operation: () => apiCall<{ key: string; erpUrl: string; error?: string }>('/api/cc_accounts/tally/bridge/key', { method: 'POST' }),
      })
      if (!call.ok || !call.result?.key) {
        flash(call.result?.error ?? t('cc_accounts.tally.keyError', 'Could not make a bridge key.'), 'error')
        return
      }
      setKey(call.result)
      onChanged({ ...settings, bridgeKeySet: true, bridgeSeenAt: null, bridgeAlive: false, bridgeTallyUrl: null })
    } finally {
      setBusy(null)
    }
  }

  const command = key ? `node tally-bridge.mjs --erp ${key.erpUrl} --key ${key.key}` : ''

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section className="space-y-4 rounded-lg border bg-card p-5 xl:col-span-1">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PlugZap className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('cc_accounts.tally.howConnect', 'How the ERP reaches Tally')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('cc_accounts.tally.howHint', 'Works with TallyPrime and Tally.ERP 9. In Tally: F1 Help → Settings → Connectivity → Client/Server: Both, port 9000.')}</p>
        </div>
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label={t('cc_accounts.tally.howConnect', 'How the ERP reaches Tally')}>
          {(
            [
              ['direct', Network, t('cc_accounts.tally.modeDirect', 'Direct'), t('cc_accounts.tally.modeDirectHint', 'The ERP server is in the same office network as Tally (plant server).')],
              ['bridge', Laptop, t('cc_accounts.tally.modeBridge', 'Bridge on the accounts PC'), t('cc_accounts.tally.modeBridgeHint', 'The ERP is on the internet. A small program on the Tally PC passes requests to Tally. No router or firewall change.')],
            ] as const
          ).map(([value, Icon, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={!canEdit}
              onClick={() => setMode(value)}
              className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', mode === value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40')}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', mode === value ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === 'direct' ? (
          <div className="space-y-1">
            <Label htmlFor="tally-url" className="text-xs text-muted-foreground">{t('cc_accounts.tally.url', 'Tally address (gateway)')}</Label>
            <Input id="tally-url" className="font-mono" placeholder="http://192.168.1.20:9000" value={url} disabled={!canEdit} onChange={(event) => setUrl(event.target.value)} />
          </div>
        ) : (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-sm">
              <span className={cn('h-2.5 w-2.5 rounded-full', settings.bridgeAlive ? 'bg-status-success-icon' : 'bg-status-error-icon')} aria-hidden="true" />
              {settings.bridgeAlive ? t('cc_accounts.tally.bridgeOn', 'Bridge running') : t('cc_accounts.tally.bridgeOff', 'Bridge not running')}
              <span className="text-xs text-muted-foreground">· {t('cc_accounts.tally.lastSeen', 'last seen {when}', { when: ago(settings.bridgeSeenAt) })}</span>
            </p>
            {settings.bridgeTallyUrl ? <p className="font-mono text-xs text-muted-foreground">{t('cc_accounts.tally.bridgeTally', 'Tally at {url}', { url: settings.bridgeTallyUrl })}</p> : null}
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void makeKey()}>
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {settings.bridgeKeySet ? t('cc_accounts.tally.newKey', 'New bridge key') : t('cc_accounts.tally.makeKey', 'Make bridge key')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => download('script')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  tally-bridge.mjs
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => download('windows')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('cc_accounts.tally.windows', 'Windows starter')}
                </Button>
              </div>
            ) : null}
            {key ? (
              <div className="space-y-1.5 rounded-md border border-status-warning-border bg-status-warning-bg p-2 text-status-warning-text">
                <p className="text-xs font-medium">{t('cc_accounts.tally.keyOnce', 'Copy this now; it is shown only once. The old key stops working.')}</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">{command}</code>
                  <Button type="button" size="icon" variant="ghost" aria-label={t('cc_accounts.tally.copy', 'Copy')} onClick={() => void navigator.clipboard?.writeText(command).then(() => flash(t('cc_accounts.tally.copied', 'Copied'), 'success'))}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}
            <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
              <li>{t('cc_accounts.tally.step1', 'Install Node.js 18+ on the Tally PC.')}</li>
              <li>{t('cc_accounts.tally.step2', 'Download both files into one folder, put the ERP address and key in the Windows starter.')}</li>
              <li>{t('cc_accounts.tally.step3', 'Double-click it and keep the window open (or add it to Windows Startup).')}</li>
            </ol>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="tally-company" className="text-xs text-muted-foreground">{t('cc_accounts.tally.company', 'Company name in Tally')}</Label>
          <Input id="tally-company" list="tally-companies" placeholder={t('cc_accounts.tally.companyHint', 'As loaded in Tally (empty = the open one)')} value={company} disabled={!canEdit} onChange={(event) => setCompany(event.target.value)} />
          <datalist id="tally-companies">
            {(test?.companies ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void runTest()} disabled={Boolean(busy)}>
            <PlugZap className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {busy === 'test' ? t('cc_accounts.tally.testing', 'Talking to Tally…') : t('cc_accounts.tally.test', 'Test connection')}
          </Button>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={() => void save()} disabled={Boolean(busy) || !dirty || settings.hasCompany === false} title={settings.hasCompany === false ? t('cc_accounts.tally.needCompany', 'Save the company details first') : undefined}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {busy === 'save' ? t('cc_accounts.tally.saving', 'Saving…') : t('cc_accounts.tally.saveSettings', 'Save settings')}
            </Button>
          ) : null}
        </div>

        {test ? (
          test.ok ? (
            <div className="space-y-1 rounded-md border border-status-success-border bg-status-success-bg p-3 text-sm text-status-success-text">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.tally.connected', 'Connected to Tally ({via})', { via: test.via === 'bridge' ? t('cc_accounts.tally.viaBridge', 'through the bridge') : t('cc_accounts.tally.viaDirect', 'direct') })}
              </p>
              <p className="text-xs">{t('cc_accounts.tally.openCompanies', 'Open companies: {names}', { names: test.companies.join(', ') || '—' })}</p>
              <p className="text-xs">{t('cc_accounts.tally.ledgerCount', '{count} ledgers read from Tally', { count: test.ledgers.length })}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-status-error-border bg-status-error-bg p-3 text-sm text-status-error-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{test.error ?? t('cc_accounts.tally.notConnected', 'Could not reach Tally')}</span>
            </div>
          )
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5 xl:col-span-2">
        <div>
          <h2 className="text-sm font-semibold">{t('cc_accounts.tally.ledgersTitle', 'Ledger names in your Tally')}</h2>
          <p className="text-xs text-muted-foreground">
            {test?.ok
              ? t('cc_accounts.tally.ledgersChecked', 'Checked against Tally: names in red are not in Tally. Pick from the list or create them in Tally with their GST details.')
              : t('cc_accounts.tally.ledgersHint3', 'Write them exactly as they are in Tally. Test the connection to check them and to pick from Tally’s own list.')}
          </p>
        </div>
        {test?.ok && test.missing.length ? (
          <div className="flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('cc_accounts.tally.missingLedgers', 'Not in Tally: {names}. Sending stops until these exist.', { names: test.missing.join(', ') })}</span>
          </div>
        ) : null}
        <datalist id="tally-ledger-names">
          {(test?.ledgers ?? []).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {LEDGER_GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">{t(`cc_accounts.tally.group.${group.key}`, group.title)}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {LEDGER_FIELDS.filter((field) => group.keys.includes(field.key)).map((field) => {
                const value = ledgers[field.key] ?? ''
                const missing = Boolean(test?.ok && value.trim() && !tallyNames.has(value.trim().toLowerCase()))
                return (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={`tally-ledger-${field.key}`} className="text-xs text-muted-foreground">{field.label}</Label>
                    <Input
                      id={`tally-ledger-${field.key}`}
                      list="tally-ledger-names"
                      disabled={!canEdit}
                      placeholder={field.fallback}
                      value={value}
                      aria-invalid={missing || undefined}
                      className={cn(missing && 'border-status-error-border text-status-error-text')}
                      onChange={(event) => setLedgers((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    />
                    {missing ? <p className="text-xs text-status-error-text">{t('cc_accounts.tally.notInTally', 'Not in Tally')}</p> : null}
                  </div>
                )
              })}
            </div>
          </fieldset>
        ))}
      </section>
    </div>
  )
}

export default TallyConnectionPanel
