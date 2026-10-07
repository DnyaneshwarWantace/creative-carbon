"use client"

import * as React from 'react'
import { Check, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { parseCsv } from '../../cc_products/lib/csv'
import { SearchPicker } from '../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../cc_orders/components/loaders'
import { MASTER_DEFS, type MasterColumn, type MasterDef, type MasterType } from '../lib/masterDefs'

type Row = Record<string, string | number | boolean | null> & { id: string; updatedAt: string; updatedByName: string | null; customerName?: string | null }
type Draft = Record<string, string | boolean | null>
type ImportReport = { dryRun: boolean; total: number; created: number; updated: number; failed: number; unknownHeaders: string[]; errors: Array<{ row: number; error: string }> }

function toDraft(def: MasterDef, row: Row | null): Draft {
  const draft: Draft = {}
  for (const column of def.columns) {
    const value = row ? row[column.key] : null
    if (column.kind === 'bool') draft[column.key] = row ? Boolean(value) : true
    else if (column.kind === 'select') draft[column.key] = value === null || value === undefined ? (column.required ? column.options?.[0]?.value ?? '' : '') : String(value)
    else draft[column.key] = value === null || value === undefined ? '' : String(value)
  }
  if (row?.customerName) draft.customerName = row.customerName
  return draft
}

function payload(def: MasterDef, draft: Draft): Record<string, unknown> {
  return Object.fromEntries(def.columns.map((column) => [column.key, column.kind === 'bool' ? Boolean(draft[column.key]) : draft[column.key] === '' ? null : draft[column.key]]))
}

function changed(def: MasterDef, row: Row, draft: Draft): boolean {
  const original = toDraft(def, row)
  return def.columns.some((column) => String(original[column.key] ?? '') !== String(draft[column.key] ?? ''))
}

function rowsFromText(text: string): Array<Record<string, string>> {
  const tabbed = text.includes('\t')
  const table = tabbed
    ? (() => {
        const lines = text.split(/\r?\n/).filter((line) => line.trim())
        return { headers: (lines[0] ?? '').split('\t').map((cell) => cell.trim()), rows: lines.slice(1).map((line) => line.split('\t')) }
      })()
    : parseCsv(text)
  return table.rows.filter((cells) => cells.some((cell) => cell.trim())).map((cells) => Object.fromEntries(table.headers.map((header, index) => [header, (cells[index] ?? '').trim()])))
}

function Cell({ column, value, customerName, editable, onChange }: { column: MasterColumn; value: string | boolean | null; customerName?: string | null; editable: boolean; onChange: (value: string | boolean | null, extra?: { customerName: string }) => void }) {
  const t = useT()
  if (column.kind === 'bool') {
    return <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(value)} disabled={!editable} onChange={(event) => onChange(event.target.checked)} aria-label={column.label} />
  }
  if (column.kind === 'select') {
    return (
      <select
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
        value={String(value ?? '')}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value)}
        aria-label={column.label}
      >
        {!column.required ? <option value="">—</option> : null}
        {(column.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  if (column.kind === 'customer') {
    if (!editable) return <span className="text-sm">{customerName ?? '—'}</span>
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-44 flex-1">
          <SearchPicker
            value={value ? { id: String(value), primary: customerName ?? '', value: null } : null}
            placeholder={t('cc_production.masters.pickCustomer', 'Customer')}
            searchPlaceholder={t('cc_production.masters.searchCustomer', 'Search customer')}
            load={searchCustomers}
            onSelect={(option) => onChange(option.id, { customerName: option.primary })}
          />
        </div>
        {value ? (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange(null, { customerName: '' })}>
            {t('cc_production.masters.clear', 'Clear')}
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <Input
      className={cn('h-8', (column.kind === 'number' || column.kind === 'int') && 'text-right font-mono tabular-nums')}
      value={String(value ?? '')}
      inputMode={column.kind === 'number' ? 'decimal' : column.kind === 'int' ? 'numeric' : undefined}
      placeholder={column.placeholder}
      disabled={!editable}
      onChange={(event) => onChange(event.target.value)}
      aria-label={column.label}
    />
  )
}

function MasterTable({ def }: { def: MasterDef }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `cc-plant-${def.type}` })
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [canManage, setCanManage] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [fresh, setFresh] = React.useState<Draft>(() => toDraft(def, null))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [importText, setImportText] = React.useState('')
  const [report, setReport] = React.useState<ImportReport | null>(null)
  const [showImport, setShowImport] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items?: Row[]; canManage?: boolean; error?: string }>(`/api/cc_production/masters?type=${def.type}`)
    if (!call.ok || !call.result?.items) {
      setError(call.result?.error ?? t('cc_production.masters.loadError', 'Could not load this list.'))
      return
    }
    setRows(call.result.items)
    setCanManage(Boolean(call.result.canManage))
    setDrafts(Object.fromEntries(call.result.items.map((row) => [row.id, toDraft(def, row)])))
  }, [def, t])

  React.useEffect(() => {
    setRows(null)
    setError(null)
    setFresh(toDraft(def, null))
    setReport(null)
    setShowImport(false)
    void load()
  }, [def, load])

  const send = async (key: string, method: 'POST' | 'PUT' | 'DELETE', body: Record<string, unknown> | null, lock: string | null, url = '/api/cc_production/masters') => {
    setBusy(key)
    try {
      const request = () => apiCall<Record<string, unknown> & { error?: string }>(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const call = await runMutation({
        context: { resourceKind: `cc_production.${def.type}`, resourceId: key },
        mutationPayload: body ?? {},
        operation: () => (lock ? withScopedApiRequestHeaders(buildOptimisticLockHeader(lock), request) : request()),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_production.masters.saveError', 'Could not save.'), 'error')
        return null
      }
      return call.result ?? {}
    } finally {
      setBusy(null)
    }
  }

  const save = async (row: Row) => {
    const draft = drafts[row.id]
    if (!draft) return
    if (await send(row.id, 'PUT', { type: def.type, id: row.id, values: payload(def, draft) }, row.updatedAt)) {
      flash(t('cc_production.masters.saved', 'Saved.'), 'success')
      await load()
    }
  }

  const add = async () => {
    if (await send('new', 'POST', { type: def.type, values: payload(def, fresh) }, null)) {
      flash(t('cc_production.masters.added', '{item} added.', { item: def.singular }), 'success')
      setFresh(toDraft(def, null))
      await load()
    }
  }

  const remove = async (row: Row) => {
    if (await send(row.id, 'DELETE', null, row.updatedAt, `/api/cc_production/masters?type=${def.type}&id=${row.id}`)) {
      flash(t('cc_production.masters.removed', 'Removed.'), 'success')
      await load()
    }
  }

  const runImport = async (dryRun: boolean) => {
    const parsed = rowsFromText(importText)
    if (!parsed.length) {
      flash(t('cc_production.masters.importEmpty', 'Paste the sheet with its header row first.'), 'error')
      return
    }
    const result = await send('import', 'POST', { type: def.type, dryRun, rows: parsed }, null, '/api/cc_production/masters/import')
    if (!result) return
    setReport(result as unknown as ImportReport)
    if (!dryRun) {
      flash(t('cc_production.masters.imported', 'Imported: {created} new, {updated} updated.', { created: Number(result.created ?? 0), updated: Number(result.updated ?? 0) }), 'success')
      setImportText('')
      await load()
    }
  }

  const readFile = async (file: File | null) => {
    if (!file) return
    setImportText(await file.text())
    setReport(null)
  }

  if (error) return <ErrorMessage label={error} />
  if (!rows) return <LoadingMessage label={t('cc_production.masters.loading', 'Loading…')} />

  const term = search.trim().toLowerCase()
  const visible = term ? rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(term))) : rows

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted-foreground">{def.hint}</p>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input className="h-8 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.masters.search', 'Search')} aria-label={t('cc_production.masters.search', 'Search')} />
          </div>
          {def.importable && canManage ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowImport((value) => !value)}>
              <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.masters.import', 'Import from Excel')}
            </Button>
          ) : null}
        </div>
      </div>

      {showImport ? (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-sm">
            {t('cc_production.masters.importHow', 'Copy the rows from the Excel sheet (with the header row) and paste them below, or choose a CSV file. Columns are matched by name: {columns}. Rows with a Die No. that already exists are updated.', {
              columns: def.columns.map((column) => column.label).join(', '),
            })}
          </p>
          <input type="file" accept=".csv,.txt,text/csv" onChange={(event) => void readFile(event.target.files?.[0] ?? null)} className="text-sm" aria-label={t('cc_production.masters.importFile', 'CSV file')} />
          <Textarea rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Die No.	Die / plate	Description	Customer" className="font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy === 'import'} onClick={() => void runImport(true)}>
              {t('cc_production.masters.check', 'Check')}
            </Button>
            <Button type="button" size="sm" disabled={busy === 'import' || !report || report.failed === report.total} onClick={() => void runImport(false)}>
              {t('cc_production.masters.importNow', 'Import the good rows')}
            </Button>
            {report ? (
              <span className="text-sm">
                {t('cc_production.masters.report', '{total} rows: {created} new, {updated} to update, {failed} with problems', { total: report.total, created: report.created, updated: report.updated, failed: report.failed })}
                {report.unknownHeaders.length ? <span className="text-muted-foreground"> · {t('cc_production.masters.ignored', 'Ignored columns: {list}', { list: report.unknownHeaders.join(', ') })}</span> : null}
              </span>
            ) : null}
          </div>
          {report?.errors.length ? (
            <ul className="max-h-40 overflow-y-auto rounded-md border bg-card text-xs">
              {report.errors.slice(0, 100).map((entry) => (
                <li key={`${entry.row}-${entry.error}`} className="border-b px-2 py-1 last:border-b-0">
                  <span className="font-mono">{t('cc_production.masters.row', 'Row {row}', { row: entry.row })}</span> · <span className="text-status-error-text">{entry.error}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {def.columns.map((column) => (
                <th key={column.key} className={cn('whitespace-nowrap border-b px-2 py-2 text-left font-semibold', (column.kind === 'number' || column.kind === 'int') && 'text-right')}>
                  {column.label}
                  {column.required ? ' *' : ''}
                </th>
              ))}
              <th className="border-b px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const draft = drafts[row.id] ?? toDraft(def, row)
              const dirty = changed(def, row, draft)
              return (
                <tr key={row.id} className={cn('align-middle', index % 2 === 1 && 'bg-muted/20')}>
                  {def.columns.map((column) => (
                    <td key={column.key} className="border-b px-2 py-1">
                      <Cell
                        column={column}
                        value={draft[column.key] ?? null}
                        customerName={typeof draft.customerName === 'string' ? draft.customerName : null}
                        editable={canManage}
                        onChange={(value, extra) => setDrafts((prev) => ({ ...prev, [row.id]: { ...draft, [column.key]: value, ...(extra ? { customerName: extra.customerName } : {}) } }))}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-b px-2 py-1 text-right">
                    {canManage ? (
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant={dirty ? 'default' : 'ghost'} disabled={!dirty || busy === row.id} onClick={() => void save(row)} aria-label={t('cc_production.masters.save', 'Save')}>
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={busy === row.id} onClick={() => void remove(row)} aria-label={t('cc_production.masters.remove', 'Remove')}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {!visible.length ? (
              <tr>
                <td colSpan={def.columns.length + 1} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('cc_production.masters.empty', 'Nothing here yet.')}
                </td>
              </tr>
            ) : null}
          </tbody>
          {canManage ? (
            <tfoot>
              <tr className="bg-muted/30">
                {def.columns.map((column) => (
                  <td key={column.key} className="px-2 py-2">
                    <Cell
                      column={column}
                      value={fresh[column.key] ?? null}
                      customerName={typeof fresh.customerName === 'string' ? fresh.customerName : null}
                      editable
                      onChange={(value, extra) => setFresh((prev) => ({ ...prev, [column.key]: value, ...(extra ? { customerName: extra.customerName } : {}) }))}
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <Button type="button" size="sm" disabled={busy === 'new'} onClick={() => void add()}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.masters.add', 'Add')}
                  </Button>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('cc_production.masters.count', '{count} rows', { count: rows.length })}</p>
    </div>
  )
}

export function MasterGridPage({ title, types }: { title: string; types: MasterType[] }) {
  const [active, setActive] = React.useState<MasterType>(types[0])
  const def = MASTER_DEFS[active]
  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <h1 className="text-xl font-semibold">{title}</h1>
          {types.length > 1 ? (
            <SegmentedControl value={active} onValueChange={(value) => setActive(value as MasterType)} aria-label={title}>
              {types.map((type) => (
                <SegmentedControlItem key={type} value={type}>
                  {MASTER_DEFS[type].label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null}
          <MasterTable def={def} />
        </div>
      </PageBody>
    </Page>
  )
}

export default MasterGridPage
