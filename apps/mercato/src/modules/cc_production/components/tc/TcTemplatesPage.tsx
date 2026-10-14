"use client"

import * as React from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import type { TcCheck, TcRow } from '../../lib/tcRules'

type Template = { id?: string; name: string; productLabel: string; grade: string; standard: string; rows: TcRow[]; isActive: boolean; updatedAt?: string }
type Kind = TcCheck['kind']

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'min', label: 'At least' },
  { value: 'max', label: 'At most' },
  { value: 'range', label: 'Within ± of nominal' },
  { value: 'text', label: 'Any entry is OK' },
]

function blankRow(index: number): TcRow {
  return { key: `row${index + 1}`, property: '', specified: '', unit: '', check: { kind: 'text' } }
}

function checkValue(check: TcCheck): string {
  if (check.kind === 'min' || check.kind === 'max') return String(check.value)
  if (check.kind === 'range') return check.nominal === 'thickness' ? 'thickness' : String(check.nominal)
  return ''
}

function withKind(row: TcRow, kind: Kind): TcRow {
  const check: TcCheck = kind === 'text' ? { kind } : kind === 'range' ? { kind, nominal: 'thickness', tolerance: 0.5 } : { kind, value: 0 }
  return { ...row, check }
}

export function TcTemplatesPage() {
  const t = useT()
  const granted = useGranted()
  const canManage = granted.has('cc_production.masters.manage')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-tc-template' })
  const [items, setItems] = React.useState<Template[]>([])
  const [draft, setDraft] = React.useState<Template | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: Template[] }>('/api/cc_production/tc/templates', undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const method = draft.id ? 'PUT' : 'POST'
      const request = () => apiCall<{ error?: string }>('/api/cc_production/tc/templates', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })
      const call = await runMutation({
        context: { resourceKind: 'cc_production.tc_template', resourceId: draft.id ?? 'new' },
        mutationPayload: draft as unknown as Record<string, unknown>,
        operation: () => (draft.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(draft.updatedAt), request) : request()),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_production.tc.templateError', 'Could not save the template.'), 'error')
        return
      }
      flash(t('cc_production.tc.templateSaved', 'Template saved.'), 'success')
      setDraft(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const setRow = (index: number, next: TcRow) => setDraft((current) => (current ? { ...current, rows: current.rows.map((row, at) => (at === index ? next : row)) } : current))

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{t('cc_production.tc.templatesTitle', 'Test certificate templates')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_production.tc.templatesHint', 'One template per product and grade: the properties, the specified value and how OK is decided.')}</p>
            </div>
            {canManage ? (
              <Button type="button" onClick={() => setDraft({ name: '', productLabel: 'PHENOLIC SHEET', grade: '', standard: 'IS 2036 : 1995', rows: [blankRow(0)], isActive: true })}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.tc.newTemplate', 'New template')}
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2">{item.productLabel} · {item.grade}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.rows.length} {t('cc_production.tc.rows', 'properties')}</td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...item })}>{t('cc_production.tc.edit', 'Edit')}</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...item, id: undefined, updatedAt: undefined, name: `${item.name} copy` })}>
                            <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('cc_production.tc.duplicate', 'Duplicate')}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft ? (
            <section className="space-y-3 rounded-md border border-border bg-card p-4" onKeyDown={(event) => { if (event.key === 'Escape') setDraft(null); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save() }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5"><Label>{t('cc_production.tc.templateName', 'Name')}</Label><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>{t('cc_production.tc.product', 'Product')}</Label><Input value={draft.productLabel} onChange={(event) => setDraft({ ...draft, productLabel: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>{t('cc_production.tc.grade', 'Grade')}</Label><Input value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })} /></div>
                <div className="space-y-1.5"><Label>{t('cc_production.tc.standard', 'Standard')}</Label><Input value={draft.standard} onChange={(event) => setDraft({ ...draft, standard: event.target.value })} /></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-1 py-1">{t('cc_production.tc.property', 'Test property')}</th>
                      <th className="px-1 py-1">{t('cc_production.tc.specified', 'Specified (as printed)')}</th>
                      <th className="px-1 py-1">{t('cc_production.tc.unit', 'Unit')}</th>
                      <th className="px-1 py-1">{t('cc_production.tc.rule', 'OK when observed is')}</th>
                      <th className="px-1 py-1">{t('cc_production.tc.limit', 'Limit / nominal')}</th>
                      <th className="px-1 py-1">±</th>
                      <th className="px-1 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-1 py-1"><Input value={row.property} onChange={(event) => setRow(index, { ...row, property: event.target.value, key: row.key.startsWith('row') ? event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 30).replace(/^[0-9]+/, '') || row.key : row.key })} /></td>
                        <td className="px-1 py-1"><Input value={row.specified} onChange={(event) => setRow(index, { ...row, specified: event.target.value })} /></td>
                        <td className="px-1 py-1"><Input className="w-28" value={row.unit} onChange={(event) => setRow(index, { ...row, unit: event.target.value })} /></td>
                        <td className="px-1 py-1">
                          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={row.check.kind} onChange={(event) => setRow(index, withKind(row, event.target.value as Kind))}>
                            {KINDS.map((kind) => (<option key={kind.value} value={kind.value}>{kind.label}</option>))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          {row.check.kind === 'text' ? null : (
                            <Input
                              className="w-28"
                              value={checkValue(row.check)}
                              placeholder={row.check.kind === 'range' ? 'thickness' : '0'}
                              onChange={(event) => {
                                const text = event.target.value.trim()
                                if (row.check.kind === 'range') setRow(index, { ...row, check: { ...row.check, nominal: text === 'thickness' || text === '' ? 'thickness' : Number(text) || 0 } })
                                else if (row.check.kind === 'min') setRow(index, { ...row, check: { ...row.check, value: Number(text) || 0 } })
                                else if (row.check.kind === 'max') setRow(index, { ...row, check: { kind: 'max', value: Number(text) || 0 } })
                              }}
                            />
                          )}
                        </td>
                        <td className="px-1 py-1">
                          {row.check.kind === 'range' ? <Input className="w-20" inputMode="decimal" value={String(row.check.tolerance)} onChange={(event) => setRow(index, { ...row, check: { ...row.check, tolerance: Number(event.target.value) || 0 } as TcCheck })} /> : null}
                        </td>
                        <td className="px-1 py-1">
                          <Button type="button" variant="ghost" size="sm" aria-label={t('cc_production.tc.removeRow', 'Remove row')} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, at) => at !== index) })}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, rows: [...draft.rows, blankRow(draft.rows.length)] })}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.tc.addRow', 'Add property')}
                </Button>
                <Button type="button" disabled={busy || !draft.name.trim() || !draft.grade.trim()} onClick={() => void save()}>{t('cc_production.tc.saveTemplate', 'Save template')}</Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t('cc_production.tc.cancel', 'Cancel')}</Button>
              </div>
            </section>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}
