"use client"

import * as React from 'react'
import { FileUp } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { KIND_CONFIG } from '../lib/kindConfig'
import type { ProductKind } from '../lib/kinds'
import { COMMON_FIELD_KEYS, fieldsForKind, loadProductFieldDefs, type ProductFieldDef } from '../lib/fieldDefs'
import { normalizeHeader, parseCsv, type CsvTable } from '../lib/csv'

type ImportPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ProductKind
  onImported: () => void
}

type Target = { value: string; label: string }
type RowResult = { row: number; status: 'created' | 'updated' | 'skipped' | 'failed'; name: string; message?: string }

const IGNORE = '__ignore'
const CHUNK_SIZE = 100

const BASE_ALIASES: Record<string, string[]> = {
  name: ['name', 'productname', 'itemname', 'materialname', 'description', 'product', 'material'],
  code: ['code', 'codeno', 'itemcode', 'newcode', 'productcode', 'internalreferenceid', 'internalreference', 'refid', 'rmcode', 'pmcode'],
  unit: ['unit', 'uom', 'units'],
  stock: ['stock', 'qty', 'quantity', 'openingstock', 'onhand', 'currentstock', 'balance'],
  hsn: ['hsn', 'hsncode', 'hsnsac'],
}

function autoMap(headers: string[], targets: Target[], defs: ProductFieldDef[]): string[] {
  const used = new Set<string>()
  return headers.map((header) => {
    const normalized = normalizeHeader(header)
    const base = Object.entries(BASE_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0]
    const field = defs.find((def) => normalizeHeader(def.key) === normalized || normalizeHeader(def.label) === normalized)
    const match = base ?? (field ? `field:${field.key}` : null)
    if (!match || used.has(match) || !targets.some((target) => target.value === match)) return IGNORE
    used.add(match)
    return match
  })
}

export function ImportPanel({ open, onOpenChange, kind, onImported }: ImportPanelProps) {
  const t = useT()
  const config = KIND_CONFIG[kind]
  const { runMutation } = useGuardedMutation({ contextId: `dermat-product-import-${kind}` })
  const [defs, setDefs] = React.useState<ProductFieldDef[]>([])
  const [table, setTable] = React.useState<CsvTable | null>(null)
  const [fileName, setFileName] = React.useState('')
  const [mapping, setMapping] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [results, setResults] = React.useState<RowResult[] | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    setTable(null)
    setFileName('')
    setMapping([])
    setResults(null)
    setProgress(0)
    loadProductFieldDefs().then((all) => setDefs(fieldsForKind(all, kind, config.fields.map((field) => field.key))))
  }, [open, kind, config])

  const targets = React.useMemo<Target[]>(() => {
    const base: Target[] = [
      { value: 'name', label: t('dermat_products.import.target.name', 'Name') },
      { value: 'code', label: config.codeLabel },
      { value: 'unit', label: t('dermat_products.import.target.unit', 'Unit') },
      { value: 'stock', label: t('dermat_products.import.target.stock', 'Opening stock') },
      { value: 'hsn', label: t('dermat_products.import.target.hsn', 'HSN code') },
    ]
    const fields = defs
      .filter((def) => !COMMON_FIELD_KEYS.has(def.key))
      .map((def) => ({ value: `field:${def.key}`, label: def.label }))
    return [...base, ...fields]
  }, [defs, config, t])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseCsv(await file.text())
    setFileName(file.name)
    setTable(parsed)
    setMapping(autoMap(parsed.headers, targets, defs))
    setResults(null)
  }

  const nameMapped = mapping.includes('name')

  const buildRows = () =>
    (table?.rows ?? []).map((cells) => {
      const row: { name?: string; code?: string; unit?: string; stock?: string; hsn?: string; fields: Record<string, string> } = { fields: {} }
      mapping.forEach((target, column) => {
        const value = (cells[column] ?? '').trim()
        if (target === IGNORE || !value) return
        if (target.startsWith('field:')) row.fields[target.slice(6)] = value
        else row[target as 'name' | 'code' | 'unit' | 'stock' | 'hsn'] = value
      })
      return row
    })

  const runImport = async () => {
    if (!table || !nameMapped) return
    const rows = buildRows()
    setBusy(true)
    setProgress(0)
    const collected: RowResult[] = []
    try {
      for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
        const chunk = rows.slice(start, start + CHUNK_SIZE)
        const body = { kind, updateExisting: true, rows: chunk }
        const call = await runMutation({
          context: { kind, operation: 'import' },
          mutationPayload: { kind, rowCount: chunk.length },
          operation: () =>
            apiCall<{ results?: RowResult[] }>('/api/dermat_products/import', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
        })
        if (!call.ok) throw new Error('[internal] import chunk failed')
        for (const result of call.result?.results ?? []) collected.push({ ...result, row: result.row + start })
        setProgress(Math.min(rows.length, start + chunk.length))
      }
      setResults(collected)
      onImported()
    } catch {
      setResults(collected)
      flash(t('dermat_products.import.failed', 'Import stopped. Rows already saved are listed below.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const counts = React.useMemo(() => {
    const summary = { created: 0, updated: 0, skipped: 0, failed: 0 }
    for (const result of results ?? []) summary[result.status] += 1
    return summary
  }, [results])

  const problems = (results ?? []).filter((result) => result.status !== 'created' && result.status !== 'updated' || result.message)
  const previewRows = table?.rows.slice(0, 5) ?? []

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('dermat_products.import.title', 'Import {kind}', { kind: config.title })}</SheetTitle>
          <SheetDescription className="text-xs">
            {t(
              'dermat_products.import.hint',
              'In Excel use File → Save As → CSV, then upload it here. Rows with an existing {code} are updated, the rest are created. Opening stock goes into the store as batch OPENING.',
              { code: config.codeLabel },
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-auto p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <FileUp className="h-6 w-6" />
            {fileName
              ? t('dermat_products.import.fileChosen', '{file} — {count} rows. Click to choose another file.', { file: fileName, count: table?.rows.length ?? 0 })
              : t('dermat_products.import.choose', 'Choose a CSV file')}
          </button>

          {table && !results ? (
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('dermat_products.import.columns', 'Match your columns')}
              </Label>
              <ul className="divide-y rounded-md border">
                {table.headers.map((header, column) => (
                  <li key={`${header}-${column}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {header || t('dermat_products.import.untitled', '(no heading)')}
                      <span className="block truncate text-xs text-muted-foreground">{previewRows[0]?.[column] ?? ''}</span>
                    </span>
                    <Select
                      value={mapping[column] ?? IGNORE}
                      onValueChange={(value) =>
                        setMapping((prev) => prev.map((entry, index) => (index === column ? value : entry === value && value !== IGNORE ? IGNORE : entry)))
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>{t('dermat_products.import.ignore', "Don't import")}</SelectItem>
                        {targets.map((target) => (
                          <SelectItem key={target.value} value={target.value}>
                            {target.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
              {!nameMapped ? (
                <p className="text-xs text-destructive">{t('dermat_products.import.needName', 'Pick which column is the Name.')}</p>
              ) : null}
            </section>
          ) : null}

          {busy ? (
            <p className="text-sm text-muted-foreground">
              {t('dermat_products.import.progress', 'Importing… {done} of {total}', { done: progress, total: table?.rows.length ?? 0 })}
            </p>
          ) : null}

          {results ? (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['created', 'updated', 'skipped', 'failed'] as const).map((status) => (
                  <div key={status} className="rounded-md border p-3">
                    <div className={cn('text-xl font-semibold', status === 'failed' && counts.failed ? 'text-status-error-text' : '')}>{counts[status]}</div>
                    <div className="text-xs text-muted-foreground">{t(`dermat_products.import.status.${status}`, status)}</div>
                  </div>
                ))}
              </div>
              {problems.length ? (
                <ul className="divide-y rounded-md border text-sm">
                  {problems.map((result) => (
                    <li key={result.row} className="flex gap-3 px-3 py-2">
                      <span className="w-12 shrink-0 text-muted-foreground">#{result.row}</span>
                      <span className="min-w-0 flex-1">
                        {result.name || '—'}
                        <span className="block text-xs text-muted-foreground">{result.message ?? result.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {results ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
          </Button>
          {!results ? (
            <Button type="button" onClick={runImport} disabled={busy || !table || !nameMapped || !table.rows.length}>
              {t('dermat_products.import.run', 'Import {count} rows', { count: table?.rows.length ?? 0 })}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ImportPanel
