"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardCheck, Copy, FlaskConical, PackagePlus, Plus, RotateCcw, Send, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker } from '../../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../../cc_orders/components/loaders'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, thisMonth, todayIso } from '../resin/shared'
import { lotLabel, useSend, useSetup, type FloorLot } from './shared'
import { PlantTable } from '../PlantTable'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { recordHref } from '../../../cc_ui/lib/links'

type Disposition = 'stock' | 'export' | 'allocation'
type FgRowView = { sr: number; sourceLotId: string; sourceLotNumber: string | null; batchNo: string | null; itemTitle: string; sheetSize: string | null; thicknessMm: number | null; qtyNos: number; rejectNos: number; rejectReason: string | null; disposition: Disposition; customerId: string | null; customerName: string | null; passKg: number | null; outputLotNumber: string | null }
type FgReport = { id: string; reportDate: string; rows: FgRowView[]; inspector: string | null; approvedBy: string | null; status: 'draft' | 'posted'; totals: { pieces: number; rejected: number; kg: number }; updatedAt: string }
type RowDraft = { key: string; sourceLotId: string; sheetSize: string; qtyNos: string; rejectNos: string; rejectReason: string; disposition: Disposition; customerId: string | null; customerName: string }

let seq = 0
const key = () => `r${(seq += 1)}`
const emptyRow = (): RowDraft => ({ key: key(), sourceLotId: '', sheetSize: '', qtyNos: '', rejectNos: '', rejectReason: '', disposition: 'stock', customerId: null, customerName: '' })

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'stock', label: 'Stock' },
  { value: 'export', label: 'Export' },
  { value: 'allocation', label: 'Allocation (customer)' },
]

function MonthInput({ month, setMonth }: { month: string; setMonth: (value: string) => void }) {
  return <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" />
}

export function FgInspectionPage() {
  const t = useT()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const send = useSend('cc-fg-inspection')
  const { setup, reload } = useSetup()
  const [month, setMonth] = React.useState(thisMonth())
  const [reports, setReports] = React.useState<FgReport[]>([])
  const [editing, setEditing] = React.useState<FgReport | null>(null)
  const [reportDate, setReportDate] = React.useState(todayIso())
  const [rows, setRows] = React.useState<RowDraft[]>([emptyRow()])
  const [inspector, setInspector] = React.useState('')
  const [approvedBy, setApprovedBy] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: FgReport[] }>(`/api/cc_production/fg-inspection?month=${month}`, undefined, { fallback: { items: [] } })
    setReports(call.result?.items ?? [])
  }, [month])
  React.useEffect(() => {
    void load()
  }, [load])

  const lots = (setup?.floorLots ?? []).filter((lot) => lot.kind === 'laminate' || lot.kind === 'moulded')
  const lotById = new Map<string, FloorLot>(lots.map((lot) => [lot.lotId, lot]))
  const update = (rowKey: string, patch: Partial<RowDraft>) => setRows(rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)))

  const edit = (report: FgReport | null) => {
    setEditing(report)
    setReportDate(report?.reportDate ?? todayIso())
    setInspector(report?.inspector ?? '')
    setApprovedBy(report?.approvedBy ?? '')
    setRows(report ? report.rows.map((row) => ({ key: key(), sourceLotId: row.sourceLotId, sheetSize: row.sheetSize ?? '', qtyNos: String(row.qtyNos), rejectNos: row.rejectNos ? String(row.rejectNos) : '', rejectReason: row.rejectReason ?? '', disposition: row.disposition, customerId: row.customerId, customerName: row.customerName ?? '' })) : [emptyRow()])
  }

  const save = async (post: boolean) => {
    const body = {
      reportDate,
      inspector: inspector || null,
      approvedBy: approvedBy || null,
      rows: rows
        .filter((row) => row.sourceLotId)
        .map((row) => ({ sourceLotId: row.sourceLotId, sheetSize: row.sheetSize || null, qtyNos: Number(row.qtyNos || 0), rejectNos: Number(row.rejectNos || 0), rejectReason: row.rejectReason || null, disposition: row.disposition, customerId: row.customerId, customerName: row.customerName || null })),
    }
    setBusy(true)
    try {
      const saved = await send<FgReport>('/api/cc_production/fg-inspection', editing ? 'PUT' : 'POST', editing ? { ...body, id: editing.id } : body, editing?.updatedAt ?? null)
      if (!saved) return
      let report = saved
      if (post) {
        const posted = await send<FgReport>('/api/cc_production/fg-inspection/action', 'POST', { id: saved.id, action: 'post' }, saved.updatedAt, 'Saved, but could not post.')
        if (posted) {
          report = posted
          flash(t('cc_production.fg.posted', 'Posted. Passed pieces are in the FG store; rejected pieces are scrapped.'), 'success')
        }
      } else flash(t('cc_production.coating.saved', 'Saved.'), 'success')
      edit(report.status === 'draft' ? report : null)
      await Promise.all([load(), reload()])
    } finally {
      setBusy(false)
    }
  }

  const reopen = async (report: FgReport) => {
    const result = await send<FgReport>('/api/cc_production/fg-inspection/action', 'POST', { id: report.id, action: 'reopen' }, report.updatedAt)
    if (result) {
      flash(t('cc_production.coating.reopened', 'Reopened. The stock movements are reversed.'), 'success')
      await Promise.all([load(), reload()])
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">CCCPL/F/QC/04</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.fg.title', 'Finished goods inspection test report')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_production.fg.lede', 'Quantity is in pieces (the printed column says kg; the entries are pieces, kg is worked out). The column printed as "Reason for rejection" is really where the goods go: Stock, Export or a customer — kept separately from a real rejection reason.')}
              </p>
            </div>
            <MonthInput month={month} setMonth={setMonth} />
          </header>

          {canEnter ? (
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">{editing ? t('cc_production.fg.editing', 'Report of {date}', { date: day(editing.reportDate) }) : t('cc_production.fg.new', 'New report')}</h2>
                <Input type="date" className="ml-auto w-44" value={reportDate} onChange={(event) => setReportDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-240 text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-2 py-2">Sr.</th>
                      <th className="px-2 py-2">{t('cc_production.fg.lot', 'Batch / lot · item')}</th>
                      <th className="w-28 px-2 py-2">{t('cc_production.fg.size', 'Sheet size')}</th>
                      <th className="w-20 px-2 py-2 text-right">{t('cc_production.fg.pass', 'Pieces OK')}</th>
                      <th className="w-20 px-2 py-2 text-right">{t('cc_production.fg.reject', 'Rejected')}</th>
                      <th className="w-40 px-2 py-2">{t('cc_production.fg.reason', 'Rejection reason')}</th>
                      <th className="w-64 px-2 py-2">{t('cc_production.fg.goesTo', 'Goes to')}</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row, index) => {
                      const lot = lotById.get(row.sourceLotId)
                      return (
                        <tr key={row.key} className="align-top">
                          <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{index + 1}</td>
                          <td className="px-2 py-1.5">
                            <Dropdown value={row.sourceLotId} onChange={(event) => update(row.key, { sourceLotId: event.target.value, sheetSize: lotById.get(event.target.value)?.cutSize ?? row.sheetSize })} aria-label="Lot">
                              <option value="" />
                              {lots.map((entry) => (
                                <option key={entry.lotId} value={entry.lotId} disabled={entry.status !== 'available'}>
                                  {lotLabel(entry)}
                                </option>
                              ))}
                            </Dropdown>
                            {lot ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {lot.batchNo ?? ''} {lot.thicknessMm ? `· ${lot.thicknessMm} mm` : ''}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5">
                            <Input list="fg-sizes" value={row.sheetSize} onChange={(event) => update(row.key, { sheetSize: event.target.value })} aria-label="Sheet size" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input className="text-right" inputMode="numeric" value={row.qtyNos} onChange={(event) => update(row.key, { qtyNos: event.target.value })} aria-label="Pieces" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input className="text-right" inputMode="numeric" value={row.rejectNos} onChange={(event) => update(row.key, { rejectNos: event.target.value })} aria-label="Rejected" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Dropdown value={row.rejectReason} onChange={(event) => update(row.key, { rejectReason: event.target.value })} aria-label="Reason">
                              <option value="" />
                              {(setup?.rejectionReasons ?? []).map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </Dropdown>
                          </td>
                          <td className="space-y-1 px-2 py-1.5">
                            <Dropdown value={row.disposition} onChange={(event) => update(row.key, { disposition: event.target.value as Disposition })} aria-label="Goes to">
                              {DISPOSITIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Dropdown>
                            {row.disposition === 'allocation' ? (
                              <SearchPicker
                                value={row.customerId ? { id: row.customerId, primary: row.customerName, value: null } : null}
                                placeholder={t('cc_production.masters.pickCustomer', 'Customer')}
                                searchPlaceholder={t('cc_production.masters.searchCustomer', 'Search customer')}
                                load={searchCustomers}
                                onSelect={(option) => update(row.key, { customerId: option?.id ?? null, customerName: option?.primary ?? '' })}
                              />
                            ) : null}
                          </td>
                          <td className="px-1 py-1.5">
                            <Button type="button" variant="ghost" size="icon" onClick={() => setRows(rows.length > 1 ? rows.filter((entry) => entry.key !== row.key) : [emptyRow()])} aria-label={t('cc_production.resin.removeLine', 'Remove row')}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <datalist id="fg-sizes">
                  {(setup?.cutSizes ?? []).map((size) => (
                    <option key={size} value={size} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, emptyRow()])}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.fg.addRow', 'Add row')}
                </Button>
                <div className="space-y-1">
                  <Label htmlFor="fg-inspector">{t('cc_production.fg.inspector', 'Q.C. inspector')}</Label>
                  <Input id="fg-inspector" className="w-48" value={inspector} onChange={(event) => setInspector(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fg-approved">{t('cc_production.fg.approved', 'Approved by')}</Label>
                  <Input id="fg-approved" className="w-48" value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} />
                </div>
                <div className="ml-auto flex gap-2">
                  {editing ? (
                    <Button type="button" variant="ghost" onClick={() => edit(null)}>
                      {t('cc_production.resin.cancel', 'Cancel')}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
                    {t('cc_production.resin.save', 'Save')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void save(true)}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.saveAndPost', 'Save and post')}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {!reports.length ? (
            <EmptyState className="py-12" variant="subtle" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.fg.empty', 'No FG inspection reports this month')} />
          ) : (
            reports.map((report) => (
              <section key={report.id} className="rounded-xl border border-border bg-card shadow-sm">
                <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2.5">
                  <Link className="font-semibold underline-offset-2 hover:underline" href={recordHref.fgInspection(report.id)}>
                    {day(report.reportDate)}
                  </Link>
                  <StatusBadge variant={report.status === 'posted' ? 'success' : 'warning'} dot>
                    {report.status === 'posted' ? 'Posted' : 'Not posted'}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {report.totals.pieces} pcs OK · {report.totals.rejected} rejected{report.totals.kg ? ` · ${kg(report.totals.kg)} kg` : ''}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {canEnter && report.status === 'draft' ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(report)}>
                        {t('cc_production.resin.edit', 'Edit')}
                      </Button>
                    ) : null}
                    {canEnter && report.status === 'posted' ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => void reopen(report)}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {t('cc_production.resin.reopen', 'Reopen')}
                      </Button>
                    ) : null}
                  </span>
                </header>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {report.rows.map((row) => (
                      <tr key={row.sr}>
                        <td className="w-10 px-4 py-1.5 text-xs text-muted-foreground">{row.sr}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{row.batchNo ?? row.sourceLotNumber}</td>
                        <td className="px-2 py-1.5">{row.itemTitle}</td>
                        <td className="px-2 py-1.5">{row.sheetSize ?? ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.thicknessMm ? `${row.thicknessMm} mm` : ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {row.qtyNos} pcs{row.passKg ? ` · ${kg(row.passKg)} kg` : ''}
                        </td>
                        <td className="px-2 py-1.5 text-xs">
                          {row.disposition === 'allocation' ? row.customerName : row.disposition === 'export' ? 'Export' : 'Stock'}
                          {row.rejectNos ? (
                            <span className="ml-2 inline-flex items-center gap-1 text-status-error-text">
                              <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                              {row.rejectNos} {row.rejectReason}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))
          )}
        </div>
      </PageBody>
    </Page>
  )
}



type DirectIn = { id: string; inDate: string; supplier: string; invoiceNo: string | null; itemTitle: string; sheetSize: string | null; thicknessMm: number | null; nos: number | null; kg: number; lotNumber: string | null }
type Damage = { id: string; entryDate: string; itemTitle: string; lotNumber: string | null; place: string; kg: number; reason: string; byName: string | null }
type ProductOption = { id: string; title: string; kind: string; unit: string }

function FormField({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function DirectInPage() {
  const t = useT()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.cutting.enter')
  const send = useSend('cc-direct-in')
  const [month, setMonth] = React.useState(thisMonth())
  const [lists, setLists] = React.useState<{ directIns: DirectIn[]; damages: Damage[] }>({ directIns: [], damages: [] })
  const [products, setProducts] = React.useState<ProductOption[]>([])
  const [lots, setLots] = React.useState<FloorLot[]>([])
  const [form, setForm] = React.useState({ inDate: todayIso(), supplier: '', invoiceNo: '', productId: '', sheetSize: '', thicknessMm: '', nos: '', kg: '' })
  const [damage, setDamage] = React.useState({ entryDate: todayIso(), lotId: '', kg: '', reason: '' })
  const { setup: finishingSetup } = useSetup()
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const [listCall, lotCall] = await Promise.all([
      apiCall<{ directIns: DirectIn[]; damages: Damage[] }>(`/api/cc_production/fg-direct?month=${month}`, undefined, { fallback: { directIns: [], damages: [] } }),
      apiCall<{ items: FloorLot[] }>('/api/cc_production/finishing/lots', undefined, { fallback: { items: [] } }),
    ])
    setLists(listCall.result ?? { directIns: [], damages: [] })
    setLots(lotCall.result?.items ?? [])
  }, [month])
  React.useEffect(() => {
    void load()
  }, [load])
  React.useEffect(() => {
    void Promise.all(
      ['laminate', 'moulded', 'bought_in'].map((kind) =>
        apiCall<{ items: Array<{ id: string; title: string; unit: string | null }> }>(`/api/cc_products/search?kinds=${kind}&limit=100`, undefined, { fallback: { items: [] } }).then((call) => (call.result?.items ?? []).map((item) => ({ id: item.id, title: item.title, kind, unit: item.unit ?? 'kg' }))),
      ),
    ).then((groups) => setProducts(groups.flat()))
  }, [])

  const receive = async () => {
    setBusy(true)
    try {
      const result = await send<{ lotNumber: string }>('/api/cc_production/fg-direct', 'POST', { ...form, invoiceNo: form.invoiceNo || null, sheetSize: form.sheetSize || null, thicknessMm: form.thicknessMm || null, nos: form.nos || null })
      if (result) {
        flash(t('cc_production.direct.done', 'Received into the FG store as {lot}.', { lot: result.lotNumber }), 'success')
        setForm({ ...form, productId: '', nos: '', kg: '', sheetSize: '', thicknessMm: '' })
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  const writeOff = async () => {
    setBusy(true)
    try {
      const result = await send<{ id: string }>('/api/cc_production/damage', 'POST', damage)
      if (result) {
        flash(t('cc_production.damage.done', 'Written off as damaged.'), 'success')
        setDamage({ ...damage, lotId: '', kg: '', reason: '' })
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  const damageLot = lots.find((lot) => lot.lotId === damage.lotId)
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.direct.eyebrow', 'FG store')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.direct.title', 'Bought-in goods and damaged material')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_production.direct.lede', 'Finished goods bought from another maker go straight into the FG store as a lot with no parent. Damaged material is written off from its lot with a reason and shows on the owner overview.')}</p>
            </div>
            <MonthInput month={month} setMonth={setMonth} />
          </header>
          {canEnter ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="flex flex-col rounded-xl border bg-card shadow-sm" aria-labelledby="direct-in-title">
                <header className="flex items-center gap-2 border-b px-5 py-3">
                  <PackagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 id="direct-in-title" className="text-sm font-semibold">{t('cc_production.direct.inTitle', 'Bought-in goods into FG')}</h2>
                </header>
                <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-4 p-5">
                  <FormField id="di-date" label={t('cc_production.resin.date', 'Date')}>
                    <Input id="di-date" type="date" value={form.inDate} onChange={(event) => setForm({ ...form, inDate: event.target.value })} />
                  </FormField>
                  <FormField id="di-invoice" label={t('cc_production.direct.invoice', 'Invoice no.')}>
                    <Input id="di-invoice" value={form.invoiceNo} onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })} />
                  </FormField>
                  <FormField id="di-supplier" label={t('cc_production.direct.supplier', 'Supplier')} className="col-span-2">
                    <Input id="di-supplier" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
                  </FormField>
                  <FormField id="di-item" label={t('cc_production.direct.item', 'Item')} className="col-span-2">
                    <Dropdown id="di-item" value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} placeholder={t('cc_production.direct.pickItem', 'Pick the item')}>
                      <option value="">—</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.title}
                        </option>
                      ))}
                    </Dropdown>
                  </FormField>
                  <FormField id="di-size" label={t('cc_production.fg.size', 'Sheet size')}>
                    <Input id="di-size" placeholder="8x4" value={form.sheetSize} onChange={(event) => setForm({ ...form, sheetSize: event.target.value })} />
                  </FormField>
                  <FormField id="di-thick" label={t('cc_production.direct.thickness', 'Thickness (mm)')}>
                    <Input id="di-thick" inputMode="decimal" value={form.thicknessMm} onChange={(event) => setForm({ ...form, thicknessMm: event.target.value })} />
                  </FormField>
                  <FormField id="di-nos" label={t('cc_production.direct.nos', 'Pieces (nos)')}>
                    <Input id="di-nos" inputMode="numeric" value={form.nos} onChange={(event) => setForm({ ...form, nos: event.target.value })} />
                  </FormField>
                  <FormField id="di-kg" label={t('cc_production.direct.kg', 'Weight (kg)')}>
                    <Input id="di-kg" inputMode="decimal" value={form.kg} onChange={(event) => setForm({ ...form, kg: event.target.value })} />
                  </FormField>
                </div>
                <footer className="flex items-center justify-between gap-3 border-t px-5 py-3">
                  <p className="text-xs text-muted-foreground">{t('cc_production.direct.inHint', 'Becomes a lot in the FG store with no parent lot.')}</p>
                  <Button type="button" disabled={busy} onClick={() => void receive()}>
                    <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.direct.receive', 'Receive into FG store')}
                  </Button>
                </footer>
              </section>
              <section className="flex flex-col rounded-xl border bg-card shadow-sm" aria-labelledby="damage-title">
                <header className="flex items-center gap-2 border-b px-5 py-3">
                  <TriangleAlert className="h-4 w-4 text-status-error-icon" aria-hidden="true" />
                  <h2 id="damage-title" className="text-sm font-semibold">{t('cc_production.damage.title', 'Damaged material')}</h2>
                </header>
                <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-4 p-5">
                  <FormField id="dm-date" label={t('cc_production.resin.date', 'Date')}>
                    <Input id="dm-date" type="date" value={damage.entryDate} onChange={(event) => setDamage({ ...damage, entryDate: event.target.value })} />
                  </FormField>
                  <FormField id="dm-qty" label={damageLot ? t('cc_production.damage.qtyIn', 'Quantity ({unit})', { unit: damageLot.unit }) : t('cc_production.damage.qty', 'Quantity')} hint={damageLot ? t('cc_production.damage.free', '{free} free in this lot', { free: damageLot.free }) : undefined}>
                    <Input id="dm-qty" inputMode="decimal" value={damage.kg} onChange={(event) => setDamage({ ...damage, kg: event.target.value })} />
                  </FormField>
                  <FormField id="dm-lot" label={t('cc_production.damage.lot', 'Lot')} className="col-span-2">
                    <Dropdown id="dm-lot" value={damage.lotId} onChange={(event) => setDamage({ ...damage, lotId: event.target.value })} placeholder={t('cc_production.damage.pickLot', 'Pick the damaged lot')}>
                      <option value="">—</option>
                      {lots.map((lot) => (
                        <option key={`${lot.lotId}-${lot.place}`} value={lot.lotId}>
                          {lotLabel(lot)} · {lot.placeLabel}
                        </option>
                      ))}
                    </Dropdown>
                  </FormField>
                  <FormField id="dm-reason" label={t('cc_production.damage.reason', 'What happened')} className="col-span-2">
                    <Input id="dm-reason" list="damage-reasons" value={damage.reason} onChange={(event) => setDamage({ ...damage, reason: event.target.value })} placeholder={t('cc_production.damage.reasonHint', 'Pick or type, e.g. Broken in handling')} />
                    <datalist id="damage-reasons">
                      {(finishingSetup?.damageReasons ?? []).map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </FormField>
                </div>
                <footer className="flex items-center justify-between gap-3 border-t px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    {!damage.lotId || !damage.reason.trim() ? t('cc_production.damage.needs', 'Pick the lot and say what happened to write off.') : t('cc_production.damage.effect', 'Taken out of stock and shown on Plant today.')}
                  </p>
                  <Button type="button" variant="outline" className="border-status-error-border text-status-error-text hover:bg-status-error-bg" disabled={busy || !damage.lotId || !damage.reason.trim()} onClick={() => void writeOff()}>
                    <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.damage.writeOff', 'Write off')}
                  </Button>
                </footer>
              </section>
            </div>
          ) : null}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">{t('cc_production.direct.list', 'Bought-in this month')}</h2>
            <PlantTable
              tableId="cc_production.direct_in"
              rows={lists.directIns}
              rowKey={(row) => row.id}
              rowHref={(row) => recordHref.directIn(row.id)}
              empty={<p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('cc_production.direct.emptyList', 'Nothing bought in this month. Use the form above when goods arrive from another maker.')}</p>}
              columns={[
                { key: 'date', label: t('cc_production.resin.date', 'Date'), alwaysVisible: true, render: (row) => day(row.inDate) },
                { key: 'supplier', label: t('cc_production.direct.supplier', 'Supplier'), render: (row) => row.supplier },
                { key: 'invoice', label: t('cc_production.direct.invoice', 'Invoice no.'), render: (row) => row.invoiceNo ?? '' },
                { key: 'item', label: t('cc_production.direct.item', 'Item'), render: (row) => row.itemTitle },
                { key: 'size', label: t('cc_production.fg.size', 'Sheet size'), hidden: true, render: (row) => row.sheetSize ?? '' },
                { key: 'thickness', label: t('cc_production.thickness.target', 'Thickness mm'), hidden: true, align: 'right', render: (row) => row.thicknessMm ?? '' },
                { key: 'nos', label: 'Nos', align: 'right', render: (row) => row.nos ?? '' },
                { key: 'kg', label: 'kg', align: 'right', render: (row) => kg(row.kg) },
                { key: 'lot', label: t('cc_production.cutting.lotShort', 'Lot'), render: (row) => <span className="font-mono text-xs">{row.lotNumber}</span> },
              ]}
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">{t('cc_production.damage.list', 'Damaged this month')}</h2>
            <PlantTable
              tableId="cc_production.damage"
              rows={lists.damages}
              rowKey={(row) => row.id}
              rowHref={(row) => recordHref.damage(row.id)}
              empty={<p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('cc_production.damage.emptyList', 'No damage written off this month.')}</p>}
              columns={[
                { key: 'date', label: t('cc_production.resin.date', 'Date'), alwaysVisible: true, render: (row) => day(row.entryDate) },
                { key: 'item', label: t('cc_production.direct.item', 'Item'), render: (row) => row.itemTitle },
                { key: 'lot', label: t('cc_production.cutting.lotShort', 'Lot'), render: (row) => <span className="font-mono text-xs">{row.lotNumber}</span> },
                { key: 'qty', label: 'kg / pcs', align: 'right', render: (row) => kg(row.kg) },
                { key: 'reason', label: t('cc_production.damage.reason', 'What happened'), render: (row) => row.reason },
                { key: 'by', label: t('cc_production.issues.by', 'By'), hidden: true, render: (row) => row.byName ?? '' },
              ]}
            />
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
