"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FlaskConical, PackageCheck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { qty, todayIso, type PoView } from './shared'

type Draft = { include: boolean; quantity: string; lotNumber: string; mfgDate: string; expiryDate: string }

export function NewGrnPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const poId = params?.get('poId') ?? ''
  const { runMutation } = useGuardedMutation({ contextId: `dermat-grn-new-${poId}` })
  const [po, setPo] = React.useState<PoView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [grnDate, setGrnDate] = React.useState(todayIso())
  const [invoiceNo, setInvoiceNo] = React.useState('')
  const [invoiceDate, setInvoiceDate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!poId) {
      setError(t('dermat_purchase.grn.noPo', 'Open this page from a purchase order.'))
      return
    }
    ;(async () => {
      const call = await apiCall<PoView>(`/api/dermat_purchase/orders?id=${encodeURIComponent(poId)}`)
      if (!call.ok || !call.result) {
        setError(t('dermat_purchase.detail.loadError', 'Could not load this purchase order.'))
        return
      }
      setPo(call.result)
      const next: Record<string, Draft> = {}
      for (const line of call.result.lines) {
        if (line.open > 0) next[line.id] = { include: true, quantity: String(line.open), lotNumber: '', mfgDate: '', expiryDate: '' }
      }
      setDrafts(next)
    })()
  }, [poId, t])

  const patch = (id: string, value: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...value } }))
  const chosen = Object.entries(drafts).filter(([, draft]) => draft.include && Number(draft.quantity) > 0)

  const submit = async () => {
    if (!po) return
    if (!chosen.length) {
      flash(t('dermat_purchase.grn.nothing', 'Tick at least one line with a quantity.'), 'error')
      return
    }
    const missingBatch = chosen.find(([, draft]) => !draft.lotNumber.trim())
    if (missingBatch) {
      flash(t('dermat_purchase.grn.needBatch', "Enter the vendor's batch no. for every line."), 'error')
      document.getElementById(`batch-${missingBatch[0]}`)?.focus()
      return
    }
    const body = {
      poId: po.id,
      grnDate,
      invoiceNo: invoiceNo.trim() || null,
      invoiceDate: invoiceDate || null,
      notes: notes.trim() || null,
      lines: chosen.map(([poLineId, draft]) => ({
        poLineId,
        quantity: Number(draft.quantity),
        lotNumber: draft.lotNumber.trim(),
        mfgDate: draft.mfgDate || null,
        expiryDate: draft.expiryDate || null,
      })),
    }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { poId: po.id },
        mutationPayload: body,
        operation: () => apiCall<{ id?: string; code?: string; error?: string }>('/api/dermat_purchase/grns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_purchase.grn.error', 'Could not save the GRN.'), 'error')
        return
      }
      flash(t('dermat_purchase.grn.saved', '{code} saved. Material is in the store under QC test.', { code: call.result.code ?? '' }), 'success')
      router.push(`/backend/purchase/grns/${call.result.id}`)
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }
  if (!po) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_purchase.detail.loading', 'Loading purchase order…')} />
        </PageBody>
      </Page>
    )
  }

  const openLines = po.lines.filter((line) => line.open > 0)

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-6xl flex-col gap-6 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') router.push(`/backend/purchase/orders/${po.id}`)
          }}
        >
          <div className="space-y-3">
            <Link href={`/backend/purchase/orders/${po.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {po.code}
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_purchase.grn.title', 'Receive goods')}</h1>
              <p className="text-sm text-muted-foreground">
                {po.vendorName} · {po.code}
              </p>
            </div>
          </div>

          <Alert status="information" style="lighter" className="rounded-lg">
            <AlertTitle>{t('dermat_purchase.grn.howTitle', 'Material goes into the store as "under QC test"')}</AlertTitle>
            <AlertDescription>{t('dermat_purchase.grn.howBody', 'It is counted in the store but cannot be reserved or issued until QC approves the batch. A QC check is created for every line.')}</AlertDescription>
          </Alert>

          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="grn-date">{t('dermat_purchase.grn.date', 'Received on')}</Label>
              <Input id="grn-date" type="date" value={grnDate} onChange={(event) => setGrnDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-invoice">{t('dermat_purchase.grn.invoice', 'Vendor invoice no.')}</Label>
              <Input id="grn-invoice" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-invoice-date">{t('dermat_purchase.grn.invoiceDate', 'Invoice date')}</Label>
              <Input id="grn-invoice-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">{t('dermat_purchase.grn.lines', 'What arrived')}</h2>
              <span className="text-xs text-muted-foreground">{t('dermat_purchase.grn.linesHint', 'Untick lines that did not come. Enter less if only part came.')}</span>
            </div>
            {openLines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="w-10 px-5 py-2.5" />
                      <th className="px-3 py-2.5">{t('dermat_purchase.form.material', 'Material')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dermat_purchase.grn.toCome', 'Still to come')}</th>
                      <th className="w-32 px-3 py-2.5">{t('dermat_purchase.grn.qty', 'Received')}</th>
                      <th className="w-40 px-3 py-2.5">{t('dermat_purchase.grn.batch', 'Vendor batch no. *')}</th>
                      <th className="w-40 px-3 py-2.5">{t('dermat_purchase.grn.mfg', 'Mfg. date')}</th>
                      <th className="w-40 px-5 py-2.5">{t('dermat_purchase.grn.expiry', 'Expiry')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {openLines.map((line) => {
                      const draft = drafts[line.id]
                      if (!draft) return null
                      const over = Number(draft.quantity) > line.open
                      return (
                        <tr key={line.id} className={cn(!draft.include && 'opacity-50')}>
                          <td className="px-5 py-3">
                            <Checkbox id={`grn-include-${line.id}`} checked={draft.include} onCheckedChange={(checked) => patch(line.id, { include: checked === true })} aria-label={line.title} />
                          </td>
                          <td className="px-3 py-3">
                            <label htmlFor={`grn-include-${line.id}`} className="block cursor-pointer font-medium">
                              {line.title}
                            </label>
                            <p className="font-mono text-xs text-muted-foreground">
                              {line.code ?? '—'} · {line.kind === 'raw_material' ? 'RM store' : 'PM store'}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{qty(line.open, line.unit)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <Input
                                id={`qty-${line.id}`}
                                aria-label={t('dermat_purchase.grn.qty', 'Received')}
                                className={cn('h-9 text-right tabular-nums', over && 'border-status-error-border')}
                                inputMode="decimal"
                                value={draft.quantity}
                                onChange={(event) => patch(line.id, { quantity: event.target.value, include: true })}
                              />
                              <span className="text-xs text-muted-foreground">{line.unit}</span>
                            </div>
                            {over ? <p className="mt-1 text-xs text-status-error-text">{t('dermat_purchase.grn.over', 'More than ordered')}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            <Input id={`batch-${line.id}`} aria-label={t('dermat_purchase.grn.batch', 'Vendor batch no. *')} className="h-9 font-mono" value={draft.lotNumber} onChange={(event) => patch(line.id, { lotNumber: event.target.value })} />
                          </td>
                          <td className="px-3 py-3">
                            <Input id={`mfg-${line.id}`} aria-label={t('dermat_purchase.grn.mfg', 'Mfg. date')} type="date" className="h-9" value={draft.mfgDate} onChange={(event) => patch(line.id, { mfgDate: event.target.value })} />
                          </td>
                          <td className="px-5 py-3">
                            <Input id={`exp-${line.id}`} aria-label={t('dermat_purchase.grn.expiry', 'Expiry')} type="date" className="h-9" value={draft.expiryDate} onChange={(event) => patch(line.id, { expiryDate: event.target.value })} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">{t('dermat_purchase.grn.allIn', 'Everything on this PO has arrived.')}</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <Label htmlFor="grn-notes">{t('dermat_purchase.grn.notes', 'Notes (damage, short, vehicle no.)')}</Label>
            <Textarea id="grn-notes" className="mt-1.5" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </section>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {t('dermat_purchase.grn.footer', '{count} batches will go to QC', { count: chosen.length })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(`/backend/purchase/orders/${po.id}`)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={busy || !chosen.length}>
                <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy ? t('dermat_purchase.grn.saving', 'Saving…') : t('dermat_purchase.grn.save', 'Save GRN')}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default NewGrnPage
