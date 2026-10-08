"use client"

import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Setting = { prefix: string; suffix: string; pad: number; startAt: number }
type Series = Setting & { key: string; label: string; department: string; defaults: Setting; lastUsed: number; next: string; kind?: 'series' | 'template'; tokens?: string[]; sample?: Record<string, string> }
type Payload = { items: Series[]; updatedAt: string | null; hasCompany: boolean }

function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

function render(template: string, date: Date): string {
  return template
    .replace(/\{FY\}/g, financialYear(date))
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{DD\}/g, String(date.getDate()).padStart(2, '0'))
}

function templatePreview(format: string, sample: Record<string, string>): string {
  return render(format, new Date()).replace(/\{([A-Z]+)\}/g, (match, token: string) => sample[token] ?? match)
}

function preview(row: Setting, lastUsed: number, samePrefix: boolean): string {
  const today = new Date()
  const next = Math.max((samePrefix ? lastUsed : 0) + 1, row.startAt || 1)
  return `${render(row.prefix, today)}${String(next).padStart(row.pad || 1, '0')}${render(row.suffix, today)}`
}

export function NumberSeriesPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-number-series' })
  const [data, setData] = React.useState<Payload | null>(null)
  const [rows, setRows] = React.useState<Record<string, Setting>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Payload & { error?: string }>('/api/cc_accounts/number-series')
    if (!call.ok || !call.result) {
      setError(call.result?.error ?? t('cc_accounts.series.loadError', 'Could not load the number series.'))
      return
    }
    setData(call.result)
    setRows(Object.fromEntries(call.result.items.map((item) => [item.key, { prefix: item.prefix, suffix: item.suffix, pad: item.pad, startAt: item.startAt }])))
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const changed = data ? data.items.filter((item) => JSON.stringify(rows[item.key]) !== JSON.stringify({ prefix: item.prefix, suffix: item.suffix, pad: item.pad, startAt: item.startAt })) : []

  const update = (key: string, patch: Partial<Setting>) => setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const save = async () => {
    if (!data || !changed.length) return
    setSaving(true)
    try {
      const body = { items: changed.map((item) => ({ key: item.key, ...rows[item.key] })) }
      const request = () => apiCall<Payload & { error?: string }>('/api/cc_accounts/number-series', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'cc_accounts.number_series', resourceId: 'company' },
        mutationPayload: body,
        operation: () => (data.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(data.updatedAt), request) : request()),
      })
      if (!call.ok || !call.result?.items) {
        flash(call.status === 409 ? (call.result?.error ?? t('cc_accounts.series.conflict', 'Someone else changed the settings. Reload and try again.')) : (call.result?.error ?? t('cc_accounts.series.saveError', 'Could not save the number series.')), 'error')
        return
      }
      setData(call.result)
      setRows(Object.fromEntries(call.result.items.map((item) => [item.key, { prefix: item.prefix, suffix: item.suffix, pad: item.pad, startAt: item.startAt }])))
      flash(t('cc_accounts.series.saved', 'Number series saved. New documents use the new numbers.'), 'success')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!data) return <Page><PageBody><PageLoading label={t('cc_accounts.series.loading', 'Loading number series…')} /></PageBody></Page>

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.series.title', 'Number series')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_accounts.series.lede', 'How each document, batch and lot is numbered. {FY} becomes the financial year (2627), {YYYY} the year, {YY} two digits, {MM} the month, {DD} the day. A new prefix starts again from "Next number from". Lot formats use their own codes (shown under each); the codes that keep two lots apart cannot be removed.')}
              </p>
            </div>
            <Button type="button" onClick={() => void save()} disabled={saving || !changed.length || !data.hasCompany}>
              {saving ? t('cc_accounts.series.saving', 'Saving…') : changed.length ? t('cc_accounts.series.saveCount', 'Save {count} changes', { count: changed.length }) : t('cc_accounts.series.save', 'Save')}
            </Button>
          </header>
          {!data.hasCompany ? <p className="rounded-md border bg-muted/40 p-3 text-sm">{t('cc_accounts.series.noCompany', 'Save the company details first (Masters → Company details), then set the number series.')}</p> : null}
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.document', 'Document')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.prefix', 'Prefix')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.digits', 'Digits')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.startAt', 'Next number from')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.suffix', 'Suffix')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.series.nextCode', 'Next document gets')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((item) => {
                  const row = rows[item.key]
                  const samePrefix = row.prefix === item.prefix && row.suffix === item.suffix
                  const dirty = changed.some((entry) => entry.key === item.key)
                  const isDefault = row.prefix === item.defaults.prefix && row.suffix === item.defaults.suffix && row.pad === item.defaults.pad && row.startAt === item.defaults.startAt
                  return (
                    <tr key={item.key} className={cn(dirty && 'bg-accent/40')}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.department} · {t('cc_accounts.series.lastUsed', 'last used {n}', { n: item.lastUsed || '—' })}</div>
                      </td>
                      {item.kind === 'template' ? (
                        <td className="px-3 py-2" colSpan={4}>
                          <Input aria-label={`${item.label} format`} className="w-full max-w-md font-mono" value={row.prefix} onChange={(event) => update(item.key, { prefix: event.target.value })} />
                          <p className="mt-1 text-xs text-muted-foreground">{t('cc_accounts.series.codes', 'Codes: {codes}', { codes: ['{DD}', '{MM}', '{YY}', '{YYYY}', ...(item.tokens ?? [])].join(' ') })}</p>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2"><Input aria-label={`${item.label} prefix`} className="w-44 font-mono" value={row.prefix} onChange={(event) => update(item.key, { prefix: event.target.value })} /></td>
                          <td className="px-3 py-2"><Input aria-label={`${item.label} digits`} type="number" min={1} max={8} className="w-20" value={row.pad} onChange={(event) => update(item.key, { pad: Number(event.target.value) || 1 })} /></td>
                          <td className="px-3 py-2"><Input aria-label={`${item.label} next number from`} type="number" min={1} className="w-28" value={row.startAt} onChange={(event) => update(item.key, { startAt: Number(event.target.value) || 1 })} /></td>
                          <td className="px-3 py-2"><Input aria-label={`${item.label} suffix`} className="w-24 font-mono" value={row.suffix} onChange={(event) => update(item.key, { suffix: event.target.value })} /></td>
                        </>
                      )}
                      <td className="px-3 py-2 font-mono text-sm tabular-nums">{item.kind === 'template' ? templatePreview(row.prefix, item.sample ?? {}) : preview(row, item.lastUsed, samePrefix)}</td>
                      <td className="px-3 py-2 text-right">
                        {!isDefault ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => update(item.key, { ...item.defaults })} aria-label={t('cc_accounts.series.reset', 'Back to default')}>
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
