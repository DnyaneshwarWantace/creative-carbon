"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileCheck2, Plus, Printer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { SearchPicker } from '../../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../../cc_orders/components/loaders'
import { FieldList, Panel, RecordPage, RecordState } from '../../../cc_ui/components/RecordPage'
import type { PrintCompany } from '../../../cc_ui/lib/printKit'
import { remarkFor, specifiedText, type TcLegendEntry, type TcRow } from '../../lib/tcRules'
import { printTc } from './printTc'

type Template = { id: string; name: string; productLabel: string; grade: string; standard: string; rows: TcRow[]; isActive: boolean; updatedAt: string }
type CertRow = { key: string; property: string; specified: string; unit: string; observed: string; remark: string; check: TcRow['check']; optional: boolean; criteria: string }
type Cert = {
  id: string
  code: string
  certDate: string
  status: 'draft' | 'issued'
  customerId: string | null
  customerName: string | null
  customerLabel: string | null
  productLabel: string
  grade: string
  standard: string
  thicknessMm: number | null
  traceability: string | null
  rows: CertRow[]
  lastColumn: 'remark' | 'criteria'
  legend: TcLegendEntry[]
  notOkCount: number
  missingCount: number
  testedBy: string | null
  verifiedBy: string | null
  issuedAt: string | null
  issuedByName: string | null
  notOkReason: string | null
  notes: string | null
  updatedAt: string
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function remarkVariant(remark: string): 'success' | 'error' | 'neutral' {
  return remark === 'OK' ? 'success' : remark === 'Not OK' ? 'error' : 'neutral'
}

export function TcListPage() {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-tc-create' })
  const [items, setItems] = React.useState<Cert[] | null>(null)
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [search, setSearch] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [templateId, setTemplateId] = React.useState('')
  const [certDate, setCertDate] = React.useState(today())
  const [customer, setCustomer] = React.useState<{ id: string; name: string } | null>(null)
  const [customerLabel, setCustomerLabel] = React.useState('')
  const [thickness, setThickness] = React.useState('')
  const [traceability, setTraceability] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items: Cert[] }>(`/api/cc_production/tc?search=${encodeURIComponent(search.trim())}`, undefined, { fallback: { items: [] } })
      setItems(call.ok ? (call.result?.items ?? []) : [])
    }, 200)
    return () => window.clearTimeout(handle)
  }, [search])

  React.useEffect(() => {
    void apiCall<{ items: Template[] }>('/api/cc_production/tc/templates', undefined, { fallback: { items: [] } }).then((call) => {
      const active = (call.result?.items ?? []).filter((entry) => entry.isActive)
      setTemplates(active)
      setTemplateId((current) => current || active[0]?.id || '')
    })
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const body = { templateId, certDate, customerId: customer?.id ?? null, customerLabel: customer ? null : customerLabel.trim() || null, thicknessMm: thickness ? Number(thickness) : null, traceability: traceability.trim() || null }
      const call = await runMutation({
        context: { resourceKind: 'cc_production.tc', resourceId: 'new' },
        mutationPayload: body,
        operation: () => apiCall<Cert & { error?: string }>('/api/cc_production/tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('cc_production.tc.createError', 'Could not start the certificate.'), 'error')
        return
      }
      router.push(`/backend/quality/tc/${call.result.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">{t('cc_production.tc.title', 'Test certificates')}</h1>
            <div className="flex items-center gap-2">
              <Input className="w-56" value={search} placeholder={t('cc_production.tc.search', 'Search TC no., customer, grade')} onChange={(event) => setSearch(event.target.value)} />
              {canEnter ? (
                <Button type="button" onClick={() => setCreating((open) => !open)}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.tc.new', 'New certificate')}
                </Button>
              ) : null}
            </div>
          </div>
          {creating ? (
            <section className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-3" onKeyDown={(event) => { if (event.key === 'Escape') setCreating(false); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && templateId) void create() }}>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.template', 'Template (product and grade)')}</Label>
                <select className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {templates.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.date', 'Date')}</Label>
                <Input type="date" value={certDate} onChange={(event) => setCertDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.thickness', 'Thickness (mm)')}</Label>
                <Input inputMode="decimal" value={thickness} onChange={(event) => setThickness(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.customer', 'Customer')}</Label>
                <SearchPicker
                  value={customer ? { id: customer.id, primary: customer.name, value: null } : null}
                  placeholder={t('cc_production.tc.pickCustomer', 'Pick from the customer list')}
                  searchPlaceholder={t('cc_production.tc.searchCustomer', 'Search customer')}
                  load={searchCustomers}
                  onSelect={(option) => setCustomer({ id: option.id, name: option.primary })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.customerLabel', 'Or type the name')}</Label>
                <Input value={customerLabel} disabled={Boolean(customer)} onChange={(event) => setCustomerLabel(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cc_production.tc.traceability', 'Production traceability (press batch)')}</Label>
                <Input value={traceability} placeholder="F/110/7/2026-27" onChange={(event) => setTraceability(event.target.value)} />
              </div>
              <div className="flex items-end gap-2 sm:col-span-3">
                <Button type="button" disabled={busy || !templateId} onClick={() => void create()}>{t('cc_production.tc.start', 'Start certificate')}</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>{t('cc_production.tc.cancel', 'Cancel')}</Button>
              </div>
            </section>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">{t('cc_production.tc.no', 'TC No.')}</th>
                  <th className="px-3 py-2">{t('cc_production.tc.date', 'Date')}</th>
                  <th className="px-3 py-2">{t('cc_production.tc.customer', 'Customer')}</th>
                  <th className="px-3 py-2">{t('cc_production.tc.product', 'Product')}</th>
                  <th className="px-3 py-2">{t('cc_production.tc.grade', 'Grade')}</th>
                  <th className="px-3 py-2">{t('cc_production.tc.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono"><Link className="text-accent-indigo hover:underline" href={`/backend/quality/tc/${item.id}`}>{item.code}</Link></td>
                    <td className="px-3 py-2">{item.certDate}</td>
                    <td className="px-3 py-2">{item.customerName ?? '—'}</td>
                    <td className="px-3 py-2">{item.productLabel}{item.thicknessMm !== null ? ` · ${item.thicknessMm} mm` : ''}</td>
                    <td className="px-3 py-2">{item.grade}</td>
                    <td className="px-3 py-2">
                      <StatusBadge variant={item.status === 'issued' ? 'success' : 'warning'}>{item.status === 'issued' ? t('cc_production.tc.issued', 'Issued') : t('cc_production.tc.draft', 'Draft')}</StatusBadge>
                    </td>
                  </tr>
                ))}
                {items && !items.length ? (
                  <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>{t('cc_production.tc.empty', 'No certificates yet.')}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export function TcDetailPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-tc' })
  const [cert, setCert] = React.useState<Cert | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [company, setCompany] = React.useState<PrintCompany | null>(null)
  const [observed, setObserved] = React.useState<Record<string, string>>({})
  const [thickness, setThickness] = React.useState('')
  const [testedBy, setTestedBy] = React.useState('')
  const [verifiedBy, setVerifiedBy] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Cert & { error?: string }>(`/api/cc_production/tc?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result?.id) {
      setError(call.result?.error ?? t('cc_production.tc.loadError', 'Could not load the certificate.'))
      return
    }
    const next = call.result
    setCert(next)
    setObserved(Object.fromEntries(next.rows.map((row) => [row.key, row.observed])))
    setThickness(next.thicknessMm === null ? '' : String(next.thicknessMm))
    setTestedBy(next.testedBy ?? '')
    setVerifiedBy(next.verifiedBy ?? '')
    setReason(next.notOkReason ?? '')
  }, [id, t])

  React.useEffect(() => {
    void load()
    void apiCall<PrintCompany>('/api/cc_accounts/company').then((call) => setCompany(call.ok ? (call.result ?? null) : null))
  }, [load])

  const thicknessNumber = thickness.trim() ? Number(thickness) : null

  const liveRemark = (row: CertRow): string => {
    return remarkFor(row, observed[row.key], thicknessNumber)
  }

  const send = async (path: string, method: 'PUT' | 'POST', body: Record<string, unknown>) => {
    if (!cert) return null
    setBusy(true)
    try {
      const request = () => apiCall<Cert & { error?: string }>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'cc_production.tc', resourceId: cert.id },
        mutationPayload: body,
        operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(cert.updatedAt), request),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_production.tc.saveError', 'Could not save.'), 'error')
        return null
      }
      return call.result ?? null
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<boolean> => {
    if (!cert) return false
    const next = await send('/api/cc_production/tc', 'PUT', { id: cert.id, observed, thicknessMm: thicknessNumber, testedBy: testedBy.trim() || null, verifiedBy: verifiedBy.trim() || null, notOkReason: reason.trim() || null })
    if (!next) return false
    await load()
    flash(t('cc_production.tc.saved', 'Saved.'), 'success')
    return true
  }

  const issue = async () => {
    if (!cert || !(await save())) return
    const latest = await apiCall<Cert>(`/api/cc_production/tc?id=${encodeURIComponent(cert.id)}`)
    const body = { id: cert.id }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'cc_production.tc', resourceId: cert.id },
        mutationPayload: body,
        operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(latest.result?.updatedAt ?? cert.updatedAt), () => apiCall<Cert & { error?: string }>('/api/cc_production/tc/issue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_production.tc.issueError', 'Could not issue the certificate.'), 'error')
        return
      }
      flash(t('cc_production.tc.issuedFlash', 'Certificate issued.'), 'success')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (error || !cert) return <RecordState error={error} loadingLabel={t('cc_production.tc.loading', 'Loading certificate…')} />
  const editable = cert.status === 'draft' && canEnter
  const notOk = cert.rows.filter((row) => liveRemark(row) === 'Not OK').length

  const print = () => {
    const ok = printTc(
      { ...cert, thicknessMm: thicknessNumber ?? cert.thicknessMm, testedBy: testedBy || cert.testedBy, verifiedBy: verifiedBy || cert.verifiedBy, rows: cert.rows.map((row) => ({ ...row, specified: specifiedText(row, thicknessNumber), observed: observed[row.key] ?? '', remark: liveRemark(row) })) },
      company,
    )
    if (!ok) flash(t('cc_production.tc.popup', 'Allow pop-ups to print.'), 'error')
  }

  return (
    <RecordPage
      back={{ href: '/backend/quality/tc', label: t('cc_production.tc.title', 'Test certificates') }}
      overline={t('cc_production.tc.entity', 'Test certificate')}
      title={cert.code}
      badges={<StatusBadge variant={cert.status === 'issued' ? 'success' : 'warning'}>{cert.status === 'issued' ? t('cc_production.tc.issued', 'Issued') : t('cc_production.tc.draft', 'Draft')}</StatusBadge>}
      meta={cert.status === 'issued' ? t('cc_production.tc.issuedMeta', 'Issued by {name}', { name: cert.issuedByName ?? '—' }) : t('cc_production.tc.draftMeta', 'Enter the observed values. OK or Not OK is worked out from the specification.')}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={print}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_production.tc.print', 'Print')}
          </Button>
          {editable ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void save()}>{t('cc_production.tc.save', 'Save')}</Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void issue()}>
                <FileCheck2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.tc.issue', 'Issue')}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <Panel title={t('cc_production.tc.header', 'Certificate details')}>
        <FieldList
          fields={[
            [t('cc_production.tc.date', 'Date'), cert.certDate],
            [t('cc_production.tc.customer', 'Customer'), cert.customerName],
            [t('cc_production.tc.product', 'Product'), cert.productLabel],
            [t('cc_production.tc.grade', 'Grade'), cert.grade],
            [t('cc_production.tc.standard', 'Standard'), cert.standard],
            [t('cc_production.tc.traceability', 'Traceability'), cert.traceability],
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tc-thickness">{t('cc_production.tc.thickness', 'Thickness (mm)')}</Label>
            <Input id="tc-thickness" className="w-28" inputMode="decimal" disabled={!editable} value={thickness} onChange={(event) => setThickness(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tc-tested">{t('cc_production.tc.testedBy', 'Tested by')}</Label>
            <Input id="tc-tested" className="w-64" disabled={!editable} value={testedBy} placeholder="Vimal (Laboratory Department)" onChange={(event) => setTestedBy(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tc-verified">{t('cc_production.tc.verifiedBy', 'Verified by')}</Label>
            <Input id="tc-verified" className="w-64" disabled={!editable} value={verifiedBy} placeholder="Dhairya Shah (Director)" onChange={(event) => setVerifiedBy(event.target.value)} />
          </div>
        </div>
      </Panel>
      <Panel title={t('cc_production.tc.properties', 'Test properties')} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">{t('cc_production.tc.property', 'Test property')}</th>
                <th className="px-3 py-2">{cert.standard}</th>
                <th className="px-3 py-2">{t('cc_production.tc.unit', 'Unit')}</th>
                <th className="px-3 py-2">{t('cc_production.tc.observed', 'Observed value')}</th>
                <th className="px-3 py-2">{t('cc_production.tc.remark', 'Remark')}</th>
                {cert.lastColumn === 'criteria' ? <th className="px-3 py-2">{t('cc_production.tc.criteria', 'Test criteria')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {cert.rows.map((row) => {
                const remark = liveRemark(row)
                return (
                  <tr key={row.key} className="border-b border-border last:border-b-0">
                    <td className="whitespace-pre-line px-3 py-2">{row.property}</td>
                    <td className="px-3 py-2">{specifiedText(row, thicknessNumber)}</td>
                    <td className="px-3 py-2">{row.unit}</td>
                    <td className="px-3 py-2">
                      <Input value={observed[row.key] ?? ''} disabled={!editable} onChange={(event) => setObserved((current) => ({ ...current, [row.key]: event.target.value }))} />
                    </td>
                    <td className="px-3 py-2">{remark ? <StatusBadge variant={remarkVariant(remark)}>{remark}</StatusBadge> : '—'}</td>
                    {cert.lastColumn === 'criteria' ? <td className="px-3 py-2 text-muted-foreground">{row.criteria}</td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {notOk > 0 || cert.notOkReason ? (
        <Panel title={t('cc_production.tc.notOkTitle', 'Not OK values')}>
          <p className="mb-2 text-sm text-muted-foreground">{t('cc_production.tc.notOkHint', 'Write why, and the Director must approve before it is issued.')}</p>
          <Textarea rows={2} disabled={!editable} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Panel>
      ) : null}
    </RecordPage>
  )
}
