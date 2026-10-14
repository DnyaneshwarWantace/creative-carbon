"use client"

import * as React from 'react'
import Link from 'next/link'
import { FileSpreadsheet, Ruler, Search, Upload } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { DIE_FAMILIES, DIE_FAMILY_KEYS, type DieFamilyKey } from '../lib/dieFamilies'

type Die = { id: string; dieNo: string; family: DieFamilyKey | null; mouldType: string; description: string | null; dimensions: Record<string, number | string>; weightKg: number | null; cavities: number | null; chartNo: number | null; chartPage: string | null; customerRef: string | null; customerName: string | null; drawingNo: string | null }
type Rod = { id: string; srNo: number | null; odText: string; lengthMm: number; quantity: number }
type Report = { kind: string; byFamily: Record<string, number>; created: number; updated: number; unchanged: number; duplicates: Array<{ dieNo: string; count: number }>; warnings: string[]; dryRun: boolean; fileName: string; error?: string }

const KIND_LABEL: Record<string, string> = { die_chart: 'Die chart', cavity_list: 'Rod & tube cavity list', rod_stock: 'Rod stock list' }
const ALL = 'all'

function DieFinder() {
  const t = useT()
  const [family, setFamily] = React.useState<DieFamilyKey | typeof ALL>('fibre_bearing')
  const [search, setSearch] = React.useState('')
  const [tolerance, setTolerance] = React.useState('2')
  const [dims, setDims] = React.useState<Record<string, string>>({})
  const [result, setResult] = React.useState<{ items: Die[]; total: number } | null>(null)
  const dimensionKeys = family === ALL ? [] : DIE_FAMILIES[family].dimensions

  React.useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ tolerance: tolerance || '0' })
      if (family !== ALL) params.set('family', family)
      if (search.trim()) params.set('search', search.trim())
      for (const [key, value] of Object.entries(dims)) if (value.trim() && dimensionKeys.includes(key)) params.set(`dim.${key}`, value.trim())
      void apiCall<{ items: Die[]; total: number }>(`/api/cc_production/masters/die-finder?${params.toString()}`).then((call) => {
        if (!cancelled && call.ok && call.result) setResult(call.result)
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [family, search, tolerance, dims, dimensionKeys])

  const columns = family === ALL ? [] : DIE_FAMILIES[family].dimensions
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="die-family" className="text-xs text-muted-foreground">
            {t('cc_production.dies.family', 'Family')}
          </Label>
          <Select
            value={family}
            onValueChange={(value) => {
              setFamily(value as DieFamilyKey | typeof ALL)
              setDims({})
            }}
          >
            <SelectTrigger id="die-family">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('cc_production.dies.allFamilies', 'All families')}</SelectItem>
              {DIE_FAMILY_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {DIE_FAMILIES[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="die-search" className="text-xs text-muted-foreground">
            {t('cc_production.dies.search', 'Code, drawing no. or customer ref')}
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input id="die-search" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="795-A, RSM, KAILASH" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="die-tolerance" className="text-xs text-muted-foreground">
            {t('cc_production.dies.tolerance', '± tolerance (mm)')}
          </Label>
          <Input id="die-tolerance" type="number" min={0} step="0.5" value={tolerance} onChange={(event) => setTolerance(event.target.value)} />
        </div>
      </div>
      {dimensionKeys.length ? (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
            {t('cc_production.dies.dimsHint', 'Type the sizes from the drawing; the closest dies come first.')}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
            {dimensionKeys.map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`die-dim-${key}`} className="text-xs font-mono text-muted-foreground">
                  {key}
                </Label>
                <Input id={`die-dim-${key}`} type="number" step="0.1" value={dims[key] ?? ''} onChange={(event) => setDims((prev) => ({ ...prev, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!result ? null : !result.items.length ? (
        <EmptyState className="py-10" variant="subtle" title={t('cc_production.dies.none', 'No die matches. Widen the tolerance or clear a size.')} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t('cc_production.dies.code', 'Die / code')}</th>
                {family === ALL ? <th className="px-3 py-2 text-left">{t('cc_production.dies.family', 'Family')}</th> : null}
                {columns.map((key) => (
                  <th key={key} className="px-2 py-2 text-right font-mono">
                    {key}
                  </th>
                ))}
                {family === ALL ? <th className="px-3 py-2 text-left">{t('cc_production.dies.sizes', 'Sizes')}</th> : null}
                <th className="px-3 py-2 text-right">{t('cc_production.dies.weight', 'Wt. kg')}</th>
                <th className="px-3 py-2 text-left">{t('cc_production.dies.ref', 'Ref / customer')}</th>
                <th className="px-3 py-2 text-left">{t('cc_production.dies.page', 'Chart')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.items.map((die) => (
                <tr key={die.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/backend/masters/moulds/${die.id}`} className="font-mono font-medium text-primary hover:underline">
                      {die.dieNo}
                    </Link>
                    {die.description && die.family && die.description !== DIE_FAMILIES[die.family].label ? <div className="max-w-64 truncate text-xs text-muted-foreground">{die.description}</div> : null}
                  </td>
                  {family === ALL ? <td className="px-3 py-2 text-xs">{die.family ? DIE_FAMILIES[die.family].label : die.mouldType}</td> : null}
                  {columns.map((key) => (
                    <td key={key} className="px-2 py-2 text-right font-mono tabular-nums">
                      {die.dimensions[key] ?? ''}
                    </td>
                  ))}
                  {family === ALL ? (
                    <td className="px-3 py-2 font-mono text-xs">
                      {Object.entries(die.dimensions)
                        .map(([key, value]) => `${key} ${value}`)
                        .join(' · ')}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{die.weightKg ?? (die.cavities ? `${die.cavities} cav.` : '')}</td>
                  <td className="px-3 py-2 text-xs">{[die.customerRef, die.customerName, die.drawingNo].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{[die.chartNo ? `#${die.chartNo}` : null, die.chartPage].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.total > result.items.length ? <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t('cc_production.dies.more', 'Showing the closest {shown} of {total}', { shown: result.items.length, total: result.total })}</p> : null}
        </div>
      )}
    </section>
  )
}

function RodStockSearch() {
  const t = useT()
  const [od, setOd] = React.useState('')
  const [length, setLength] = React.useState('')
  const [result, setResult] = React.useState<{ items: Rod[]; totalPieces: number } | null>(null)
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (od.trim()) params.set('od', od.trim())
    if (length.trim()) params.set('length', length.trim())
    void apiCall<{ items: Rod[]; totalPieces: number }>(`/api/cc_production/rod-stock?${params.toString()}`).then((call) => setResult(call.ok ? (call.result ?? null) : null))
  }, [od, length])
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <div className="grid grid-cols-2 gap-3 sm:w-96">
        <div className="space-y-1">
          <Label htmlFor="rod-od" className="text-xs text-muted-foreground">
            {t('cc_production.rods.od', 'Rod OD (mm)')}
          </Label>
          <Input id="rod-od" type="number" step="0.1" value={od} onChange={(event) => setOd(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rod-length" className="text-xs text-muted-foreground">
            {t('cc_production.rods.length', 'Length (mm, ± 50)')}
          </Label>
          <Input id="rod-length" type="number" value={length} onChange={(event) => setLength(event.target.value)} />
        </div>
      </div>
      {result ? (
        result.items.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">{t('cc_production.rods.sr', 'Sr.')}</th>
                  <th className="px-3 py-2 text-left">{t('cc_production.rods.od', 'Rod OD (mm)')}</th>
                  <th className="px-3 py-2 text-right">{t('cc_production.rods.lengthShort', 'Length')}</th>
                  <th className="px-3 py-2 text-right">{t('cc_production.rods.qty', 'Qty (pcs)')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.items.map((rod) => (
                  <tr key={rod.id}>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{rod.srNo ?? ''}</td>
                    <td className="px-3 py-1.5 font-mono">{rod.odText}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{rod.lengthMm}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{rod.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted font-semibold">
                <tr>
                  <td className="px-3 py-1.5" colSpan={3}>
                    {t('cc_production.rods.total', 'Total pieces')}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{result.totalPieces}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState className="py-10" variant="subtle" title={t('cc_production.rods.none', 'No rods in stock for that size. Import the tube rod list if it is not loaded yet.')} />
        )
      ) : null}
    </section>
  )
}

function ChartImport() {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-die-chart-import' })
  const [file, setFile] = React.useState<File | null>(null)
  const [report, setReport] = React.useState<Report | null>(null)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const send = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('dryRun', dryRun ? 'true' : 'false')
      const call = await runMutation({
        context: { fileName: file.name, dryRun },
        mutationPayload: { fileName: file.name, dryRun },
        operation: () => apiCall<Report>('/api/cc_production/masters/die-chart', { method: 'POST', body: form }),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.dies.importError', 'Could not read the file.'), 'error')
        return
      }
      setReport(call.result)
      if (!dryRun) flash(t('cc_production.dies.imported', 'Imported: {created} new, {updated} updated', { created: call.result.created, updated: call.result.updated }), 'success')
    } finally {
      setBusy(false)
    }
  }
  if (!granted.has('cc_production.masters.manage')) return <p className="text-sm text-muted-foreground">{t('cc_production.dies.noImport', 'Only the masters team can import the charts.')}</p>
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <p className="text-sm text-muted-foreground">{t('cc_production.dies.importHint', 'Upload the CCPL die chart (all sheets), the rod & tube cavity list or the tube rod list as they are. Check first, then import. Importing the same file again changes nothing.')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setReport(null)
          }}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {file ? file.name : t('cc_production.dies.choose', 'Choose the Excel file')}
        </Button>
        <Button type="button" variant="outline" disabled={!file || busy} onClick={() => void send(true)}>
          {t('cc_production.dies.check', 'Check')}
        </Button>
        <Button type="button" disabled={!file || busy || !report?.dryRun} onClick={() => void send(false)}>
          <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('cc_production.dies.import', 'Import')}
        </Button>
      </div>
      {report ? (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <p className="font-semibold">
            {KIND_LABEL[report.kind] ?? report.kind} · {report.dryRun ? t('cc_production.dies.checked', 'checked, nothing saved yet') : t('cc_production.dies.saved', 'saved')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge variant="success">{t('cc_production.dies.created', '{n} new', { n: report.created })}</StatusBadge>
            <StatusBadge variant="info">{t('cc_production.dies.updated', '{n} updated', { n: report.updated })}</StatusBadge>
            <StatusBadge variant="neutral">{t('cc_production.dies.unchanged', '{n} unchanged', { n: report.unchanged })}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">
            {Object.entries(report.byFamily)
              .map(([key, count]) => `${DIE_FAMILIES[key as DieFamilyKey]?.label ?? (key === 'rod_stock' ? 'Rod stock rows' : key)}: ${count}`)
              .join(' · ')}
          </p>
          {report.duplicates.length ? (
            <p className="text-xs text-status-warning-text">
              {t('cc_production.dies.duplicates', 'Same code more than once (kept as separate dies; check with the plant): {list}', { list: report.duplicates.slice(0, 20).map((entry) => `${entry.dieNo} ×${entry.count}`).join(', ') })}
              {report.duplicates.length > 20 ? ` +${report.duplicates.length - 20}` : ''}
            </p>
          ) : null}
          {report.warnings.length ? <p className="text-xs text-status-warning-text">{report.warnings.join(' · ')}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

export function DieChartPage() {
  const t = useT()
  const [tab, setTab] = React.useState<'finder' | 'rods' | 'import'>('finder')
  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div>
            <h1 className="text-xl font-bold">{t('cc_production.dies.title', 'Die chart & rod stock')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_production.dies.lede', 'Jatinbhai’s die chart with every size, the rod & tube cavity moulds, and the rod stock list. Find a die from a drawing before making a new one.')}</p>
          </div>
          <SegmentedControl value={tab} onValueChange={(value) => setTab(value as typeof tab)} aria-label={t('cc_production.dies.sections', 'Sections')}>
            <SegmentedControlItem value="finder">{t('cc_production.dies.finder', 'Die finder')}</SegmentedControlItem>
            <SegmentedControlItem value="rods">{t('cc_production.dies.rods', 'Rod stock')}</SegmentedControlItem>
            <SegmentedControlItem value="import">{t('cc_production.dies.importTab', 'Import Excel')}</SegmentedControlItem>
          </SegmentedControl>
          {tab === 'finder' ? <DieFinder /> : null}
          {tab === 'rods' ? <RodStockSearch /> : null}
          {tab === 'import' ? <ChartImport /> : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default DieChartPage
