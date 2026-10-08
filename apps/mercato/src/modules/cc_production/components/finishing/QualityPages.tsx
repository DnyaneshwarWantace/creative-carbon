"use client"

import * as React from 'react'
import { ClipboardCheck, Copy, FlaskConical, PackagePlus, Plus, RotateCcw, Send, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { AttachmentsSection } from '@open-mercato/ui/backend/detail/AttachmentsSection'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker } from '../../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../../cc_orders/components/loaders'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, thisMonth, todayIso } from '../resin/shared'
import { lotLabel, selectClass, useSend, useSetup, type FloorLot } from './shared'
import { PlantTable } from '../PlantTable'

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
                <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? t('cc_production.fg.editing', 'Report of {date}', { date: day(editing.reportDate) }) : t('cc_production.fg.new', 'New report')}</h2>
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
                            <select className={selectClass} value={row.sourceLotId} onChange={(event) => update(row.key, { sourceLotId: event.target.value, sheetSize: lotById.get(event.target.value)?.cutSize ?? row.sheetSize })} aria-label="Lot">
                              <option value="" />
                              {lots.map((entry) => (
                                <option key={entry.lotId} value={entry.lotId} disabled={entry.status !== 'available'}>
                                  {lotLabel(entry)}
                                </option>
                              ))}
                            </select>
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
                            <select className={selectClass} value={row.rejectReason} onChange={(event) => update(row.key, { rejectReason: event.target.value })} aria-label="Reason">
                              <option value="" />
                              {(setup?.rejectionReasons ?? []).map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="space-y-1 px-2 py-1.5">
                            <select className={selectClass} value={row.disposition} onChange={(event) => update(row.key, { disposition: event.target.value as Disposition })} aria-label="Goes to">
                              {DISPOSITIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
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
                  <span className="font-semibold">{day(report.reportDate)}</span>
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

type LabTest = { id: string; testDate: string; lotRefs: string | null; itemTitle: string | null; customerId: string | null; customerName: string | null; testType: string; standard: string | null; result: 'pass' | 'fail' | 'pending'; notes: string | null; updatedAt: string }
type LabDraft = { testDate: string; lotRefs: string; itemTitle: string; customerId: string | null; customerName: string; testType: string; standard: string; result: 'pass' | 'fail' | 'pending'; notes: string }

const blankLab = (): LabDraft => ({ testDate: todayIso(), lotRefs: '', itemTitle: '', customerId: null, customerName: '', testType: '', standard: '', result: 'pending', notes: '' })

export function LabPage() {
  const t = useT()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const send = useSend('cc-lab')
  const { setup } = useSetup()
  const [month, setMonth] = React.useState(thisMonth())
  const [items, setItems] = React.useState<LabTest[]>([])
  const [draft, setDraft] = React.useState<LabDraft>(blankLab())
  const [editing, setEditing] = React.useState<LabTest | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: LabTest[] }>(`/api/cc_production/lab?month=${month}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [month])
  React.useEffect(() => {
    void load()
  }, [load])

  const copyLast = async () => {
    if (!draft.customerName) {
      flash(t('cc_production.lab.pickFirst', 'Pick the customer first'), 'error')
      return
    }
    const params = new URLSearchParams({ last: 'true', customerName: draft.customerName })
    if (draft.itemTitle) params.set('itemTitle', draft.itemTitle)
    const call = await apiCall<{ item: LabTest | null }>(`/api/cc_production/lab?${params.toString()}`)
    const last = call.result?.item
    if (!last) {
      flash(t('cc_production.lab.noLast', 'No earlier test for this customer and item'), 'error')
      return
    }
    setDraft({ ...draft, itemTitle: last.itemTitle ?? draft.itemTitle, testType: last.testType, standard: last.standard ?? '', notes: last.notes ?? '' })
    flash(t('cc_production.lab.copied', 'Copied from the test of {date}.', { date: day(last.testDate) }), 'success')
  }

  const save = async () => {
    setBusy(true)
    try {
      const body = { ...draft, lotRefs: draft.lotRefs || null, itemTitle: draft.itemTitle || null, standard: draft.standard || null, notes: draft.notes || null }
      const saved = await send<LabTest>('/api/cc_production/lab', editing ? 'PUT' : 'POST', editing ? { ...body, id: editing.id } : body, editing?.updatedAt ?? null)
      if (saved) {
        flash(t('cc_production.lab.saved', 'Saved. Attach the report file below.'), 'success')
        setEditing(saved)
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  const open = (item: LabTest | null) => {
    setEditing(item)
    setDraft(item ? { testDate: item.testDate, lotRefs: item.lotRefs ?? '', itemTitle: item.itemTitle ?? '', customerId: item.customerId, customerName: item.customerName ?? '', testType: item.testType, standard: item.standard ?? '', result: item.result, notes: item.notes ?? '' } : blankLab())
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.quality.eyebrow', 'Quality')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.lab.title', 'Lab test reports')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_production.lab.lede', 'Tests are run to the customer specification, not per batch. Record what was tested, for whom and to which standard, and attach the report; "Copy last time" repeats the last test for the same customer and item.')}</p>
            </div>
            <MonthInput month={month} setMonth={setMonth} />
          </header>
          {canEnter ? (
            <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-date">{t('cc_production.resin.date', 'Date')}</Label>
                <Input id="lab-date" type="date" value={draft.testDate} onChange={(event) => setDraft({ ...draft, testDate: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.moulding.customer', 'Customer')}</Label>
                <SearchPicker
                  value={draft.customerId ? { id: draft.customerId, primary: draft.customerName, value: null } : null}
                  placeholder={t('cc_production.masters.pickCustomer', 'Customer')}
                  searchPlaceholder={t('cc_production.masters.searchCustomer', 'Search customer')}
                  load={searchCustomers}
                  onSelect={(option) => setDraft({ ...draft, customerId: option?.id ?? null, customerName: option?.primary ?? '' })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-item">{t('cc_production.lab.item', 'Item')}</Label>
                <Input id="lab-item" placeholder="Fabric 10x10 Sheet" value={draft.itemTitle} onChange={(event) => setDraft({ ...draft, itemTitle: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-lots">{t('cc_production.lab.lots', 'Lot(s)')}</Label>
                <Input id="lab-lots" placeholder="F/74/07/26, F/75/07/26" value={draft.lotRefs} onChange={(event) => setDraft({ ...draft, lotRefs: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-type">{t('cc_production.lab.type', 'Test type')}</Label>
                <select id="lab-type" className={selectClass} value={draft.testType} onChange={(event) => setDraft({ ...draft, testType: event.target.value })}>
                  <option value="" />
                  {(setup?.testTypes ?? []).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-standard">{t('cc_production.lab.standard', 'Standard')}</Label>
                <select id="lab-standard" className={selectClass} value={draft.standard} onChange={(event) => setDraft({ ...draft, standard: event.target.value })}>
                  <option value="" />
                  {(setup?.standards ?? []).map((standard) => (
                    <option key={standard} value={standard}>
                      {standard}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-result">{t('cc_production.lab.result', 'Result')}</Label>
                <select id="lab-result" className={selectClass} value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value as LabDraft['result'] })}>
                  <option value="pending">Pending</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="lab-notes">{t('cc_production.resin.notes', 'Remarks')}</Label>
                <Textarea id="lab-notes" rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-3">
                <Button type="button" variant="ghost" onClick={() => void copyLast()}>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.lab.copy', 'Copy last time')}
                </Button>
                {editing ? (
                  <Button type="button" variant="outline" onClick={() => open(null)}>
                    {t('cc_production.lab.newOne', 'New test')}
                  </Button>
                ) : null}
                <Button type="button" disabled={busy} onClick={() => void save()}>
                  <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.save', 'Save')}
                </Button>
              </div>
              {editing ? (
                <div className="md:col-span-3">
                  <AttachmentsSection entityId="cc_production:lab_test" recordId={editing.id} compact />
                </div>
              ) : null}
            </section>
          ) : null}
          <PlantTable
            tableId="cc_production.lab_tests"
            rows={items}
            rowKey={(item) => item.id}
            empty={<EmptyState className="py-12" variant="subtle" icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.lab.empty', 'No lab tests this month')} />}
            columns={[
              { key: 'date', label: t('cc_production.resin.date', 'Date'), alwaysVisible: true, render: (item) => <button type="button" className="underline-offset-2 hover:underline" onClick={() => open(item)}>{day(item.testDate)}</button> },
              { key: 'customer', label: t('cc_production.moulding.customer', 'Customer'), render: (item) => <span className="font-medium">{item.customerName}</span> },
              { key: 'item', label: t('cc_production.lab.item', 'Item'), render: (item) => item.itemTitle ?? '—' },
              { key: 'lots', label: t('cc_production.lab.lots', 'Lot(s)'), render: (item) => <span className="font-mono text-xs">{item.lotRefs ?? ''}</span> },
              { key: 'type', label: t('cc_production.lab.type', 'Test type'), render: (item) => item.testType },
              { key: 'standard', label: t('cc_production.lab.standard', 'Standard'), render: (item) => item.standard ?? '' },
              { key: 'notes', label: t('cc_production.resin.notes', 'Remarks'), hidden: true, render: (item) => item.notes ?? '' },
              { key: 'result', label: t('cc_production.lab.result', 'Result'), render: (item) => <StatusBadge variant={item.result === 'pass' ? 'success' : item.result === 'fail' ? 'error' : 'warning'}>{item.result}</StatusBadge> },
            ]}
          />
        </div>
      </PageBody>
    </Page>
  )
}

type DirectIn = { id: string; inDate: string; supplier: string; invoiceNo: string | null; itemTitle: string; sheetSize: string | null; thicknessMm: number | null; nos: number | null; kg: number; lotNumber: string | null }
type Damage = { id: string; entryDate: string; itemTitle: string; lotNumber: string | null; place: string; kg: number; reason: string; byName: string | null }
type ProductOption = { id: string; title: string; kind: string; unit: string }

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
              <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="col-span-2 text-sm font-semibold uppercase tracking-wide">{t('cc_production.direct.in', 'FG direct in')}</h2>
                <Input type="date" value={form.inDate} onChange={(event) => setForm({ ...form, inDate: event.target.value })} aria-label="Date" />
                <Input placeholder={t('cc_production.direct.supplier', 'Supplier')} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
                <Input placeholder={t('cc_production.direct.invoice', 'Invoice no.')} value={form.invoiceNo} onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })} />
                <select className={selectClass} value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} aria-label="Item">
                  <option value="">{t('cc_production.direct.item', 'Item')}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
                <Input placeholder={t('cc_production.fg.size', 'Sheet size')} value={form.sheetSize} onChange={(event) => setForm({ ...form, sheetSize: event.target.value })} />
                <Input placeholder={t('cc_production.thickness.target', 'Thickness mm')} inputMode="decimal" value={form.thicknessMm} onChange={(event) => setForm({ ...form, thicknessMm: event.target.value })} />
                <Input placeholder="Nos" inputMode="numeric" value={form.nos} onChange={(event) => setForm({ ...form, nos: event.target.value })} />
                <Input placeholder="kg" inputMode="decimal" value={form.kg} onChange={(event) => setForm({ ...form, kg: event.target.value })} />
                <div className="col-span-2 flex justify-end">
                  <Button type="button" disabled={busy} onClick={() => void receive()}>
                    <PackagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.direct.receive', 'Receive into FG store')}
                  </Button>
                </div>
              </section>
              <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="col-span-2 text-sm font-semibold uppercase tracking-wide">{t('cc_production.damage.title', 'Damaged material')}</h2>
                <Input type="date" value={damage.entryDate} onChange={(event) => setDamage({ ...damage, entryDate: event.target.value })} aria-label="Date" />
                <Input placeholder={damageLot ? `${damageLot.unit} (${damageLot.free} free)` : 'kg'} inputMode="decimal" value={damage.kg} onChange={(event) => setDamage({ ...damage, kg: event.target.value })} />
                <select className={`${selectClass} col-span-2`} value={damage.lotId} onChange={(event) => setDamage({ ...damage, lotId: event.target.value })} aria-label="Lot">
                  <option value="">{t('cc_production.damage.lot', 'Lot')}</option>
                  {lots.map((lot) => (
                    <option key={`${lot.lotId}-${lot.place}`} value={lot.lotId}>
                      {lotLabel(lot)} · {lot.placeLabel}
                    </option>
                  ))}
                </select>
                <Input className="col-span-2" list="damage-reasons" placeholder={t('cc_production.damage.reason', 'What happened')} value={damage.reason} onChange={(event) => setDamage({ ...damage, reason: event.target.value })} />
                <datalist id="damage-reasons">
                  {(finishingSetup?.damageReasons ?? []).map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <div className="col-span-2 flex justify-end">
                  <Button type="button" variant="destructive" disabled={busy || !damage.lotId || !damage.reason.trim()} onClick={() => void writeOff()}>
                    {t('cc_production.damage.writeOff', 'Write off')}
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{t('cc_production.direct.list', 'Bought-in this month')}</h2>
            <PlantTable
              tableId="cc_production.direct_in"
              rows={lists.directIns}
              rowKey={(row) => row.id}
              empty={<p className="px-5 py-6 text-sm text-muted-foreground">—</p>}
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
            <h2 className="text-sm font-semibold uppercase tracking-wide">{t('cc_production.damage.list', 'Damaged this month')}</h2>
            <PlantTable
              tableId="cc_production.damage"
              rows={lists.damages}
              rowKey={(row) => row.id}
              empty={<p className="px-5 py-6 text-sm text-muted-foreground">—</p>}
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
