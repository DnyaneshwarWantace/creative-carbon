"use client"

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Unit = { id: string; value: string; label: string; isDefault: boolean; products: number; updatedAt: string | null }
type Payload = { dictionaryId: string | null; items: Unit[] }

const CODE_RE = /^[a-z0-9][a-z0-9._-]{0,19}$/

export function UnitsPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-units' })
  const [data, setData] = React.useState<Payload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [names, setNames] = React.useState<Record<string, string>>({})
  const [codes, setCodes] = React.useState<Record<string, string>>({})
  const [draft, setDraft] = React.useState({ value: '', label: '' })
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const call = await apiCall<Payload & { error?: string }>('/api/cc_lists/units')
    if (!call.ok || !call.result) {
      setError(call.result?.error ?? t('cc_lists.units.loadError', 'Could not load units.'))
      return
    }
    setData(call.result)
    setNames(Object.fromEntries(call.result.items.map((unit) => [unit.id, unit.label])))
    setCodes(Object.fromEntries(call.result.items.map((unit) => [unit.id, unit.value])))
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const mutate = async (key: string, url: string, method: string, body: Record<string, unknown> | null, lock: string | null) => {
    setBusy(key)
    try {
      const request = () => apiCall<{ error?: string }>(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const call = await runMutation({
        context: { resourceKind: 'dictionaries.entry', resourceId: key },
        mutationPayload: body ?? {},
        operation: () => (lock ? withScopedApiRequestHeaders(buildOptimisticLockHeader(lock), request) : request()),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_lists.units.saveError', 'Could not save the unit.'), 'error')
        return false
      }
      await load()
      return true
    } finally {
      setBusy(null)
    }
  }

  const add = async () => {
    if (!data?.dictionaryId) return
    const value = draft.value.trim().toLowerCase()
    const label = draft.label.trim()
    if (!CODE_RE.test(value) || !label) {
      flash(t('cc_lists.units.addInvalid', 'Enter a short code (letters/digits, e.g. box) and a name.'), 'error')
      return
    }
    if (data.items.some((unit) => unit.value === value)) {
      flash(t('cc_lists.units.duplicate', 'That unit code already exists.'), 'error')
      return
    }
    if (await mutate('new', `/api/dictionaries/${data.dictionaryId}/entries`, 'POST', { value, label, position: data.items.length }, null)) {
      setDraft({ value: '', label: '' })
      flash(t('cc_lists.units.added', 'Unit added. It now shows in the product form.'), 'success')
    }
  }

  const save = async (unit: Unit) => {
    if (!data?.dictionaryId) return
    const label = (names[unit.id] ?? '').trim()
    const value = (codes[unit.id] ?? '').trim().toLowerCase()
    if (!label || !CODE_RE.test(value)) {
      flash(t('cc_lists.units.addInvalid', 'Enter a short code (letters/digits, e.g. box) and a name.'), 'error')
      return
    }
    if (value !== unit.value && data.items.some((other) => other.value === value)) {
      flash(t('cc_lists.units.duplicate', 'That unit code already exists.'), 'error')
      return
    }
    const body: Record<string, unknown> = { label }
    if (value !== unit.value) body.value = value
    if (await mutate(unit.id, `/api/dictionaries/${data.dictionaryId}/entries/${unit.id}`, 'PATCH', body, unit.updatedAt)) flash(t('cc_lists.units.saved', 'Unit saved.'), 'success')
  }

  const remove = async (unit: Unit) => {
    if (!data?.dictionaryId || unit.products > 0) return
    if (await mutate(unit.id, `/api/dictionaries/${data.dictionaryId}/entries/${unit.id}`, 'DELETE', null, unit.updatedAt)) flash(t('cc_lists.units.removed', 'Unit removed.'), 'success')
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!data) return <Page><PageBody><PageLoading label={t('cc_lists.units.loading', 'Loading units…')} /></PageBody></Page>

  return (
    <Page>
      <PageBody>
        <div className="flex max-w-4xl flex-col gap-5">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_lists.units.title', 'Units')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_lists.units.lede', 'Units of measure offered on products (kg for raw materials and bulk, pc or nos for packing and finished goods). A unit used by products can be renamed but not removed or recoded.')}</p>
          </header>
          {!data.dictionaryId ? <ErrorMessage label={t('cc_lists.units.noDictionary', 'The unit list is not set up for this company yet.')} /> : null}
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_lists.units.code', 'Code')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_lists.units.name', 'Name shown')}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t('cc_lists.units.used', 'Used by')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((unit) => {
                  const dirty = (names[unit.id] ?? unit.label) !== unit.label || (codes[unit.id] ?? unit.value) !== unit.value
                  return (
                    <tr key={unit.id}>
                      <td className="px-3 py-2">
                        <Input aria-label={t('cc_lists.units.code', 'Code')} className="w-28 font-mono" value={codes[unit.id] ?? unit.value} disabled={unit.products > 0} onChange={(event) => setCodes((prev) => ({ ...prev, [unit.id]: event.target.value }))} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('cc_lists.units.name', 'Name shown')} className="w-64" value={names[unit.id] ?? unit.label} onChange={(event) => setNames((prev) => ({ ...prev, [unit.id]: event.target.value }))} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {unit.products ? <StatusBadge variant="info">{t('cc_lists.units.products', '{n} products', { n: unit.products })}</StatusBadge> : <span className="text-muted-foreground">{t('cc_lists.units.unused', 'not used')}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {dirty ? <Button type="button" size="sm" onClick={() => void save(unit)} disabled={busy === unit.id}>{t('cc_lists.units.save', 'Save')}</Button> : null}
                          <Button type="button" variant="ghost" size="sm" onClick={() => void remove(unit)} disabled={unit.products > 0 || busy === unit.id} aria-label={t('cc_lists.units.remove', 'Remove unit')}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-muted/20">
                  <td className="px-3 py-2"><Input aria-label={t('cc_lists.units.newCode', 'New unit code')} placeholder="box" className="w-28 font-mono" value={draft.value} onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))} /></td>
                  <td className="px-3 py-2"><Input aria-label={t('cc_lists.units.newName', 'New unit name')} placeholder={t('cc_lists.units.newNamePlaceholder', 'Box (BOX)')} className="w-64" value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} /></td>
                  <td />
                  <td className="px-3 py-2 text-right">
                    <Button type="button" size="sm" onClick={() => void add()} disabled={busy === 'new' || !data.dictionaryId}>
                      <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                      {t('cc_lists.units.add', 'Add unit')}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
