"use client"

import * as React from 'react'
import Link from 'next/link'
import { Printer, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { rupeeText } from '../../cc_products/lib/whatsapp'
import type { CompanyView } from './types'

type Entry = { date: string; kind: 'invoice' | 'credit_note' | 'payment'; ref: string; id: string; orderNo: string; detail: string; debit: number; credit: number; balance: number }
type OpenInvoice = { id: string; code: string; orderNo: string; invoiceDate: string; dueDate: string | null; amount: number; paid: number; open: number; daysOverdue: number }
type Statement = {
  asOf: string
  entries: Entry[]
  openInvoices: OpenInvoice[]
  ageing: { current: number; d1_30: number; d31_60: number; d61_90: number; d90: number }
  summary: { orders: number; orderValue: number; invoiced: number; notInvoiced: number; received: number; balance: number; advanceOnAccount: number; overdue: number }
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function printStatement(customerName: string, statement: Statement, company: CompanyView | null): boolean {
  const popup = window.open('', '_blank', 'width=980,height=1100')
  if (!popup) return false
  const rows = statement.entries
    .map((entry) => `<tr><td>${day(entry.date)}</td><td class="mono">${esc(entry.ref)}</td><td>${esc(entry.detail)}<div class="code">${esc(entry.orderNo)}</div></td><td class="r">${entry.debit ? money(entry.debit) : ''}</td><td class="r">${entry.credit ? money(entry.credit) : ''}</td><td class="r">${money(entry.balance)}</td></tr>`)
    .join('')
  const a = statement.ageing
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement ${esc(customerName)}</title><style>
    body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;padding:30px;font-size:11.5px} h1{font-size:18px;margin:0} .muted{color:#78716c} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#57534e}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #1c1917;padding-bottom:10px;margin-bottom:14px} table{width:100%;border-collapse:collapse} th{font-size:9.5px;text-transform:uppercase;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px 5px} td{padding:6px 5px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap}
    .age{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0} .age div{border:1px solid #d6d3d1;border-radius:6px;padding:8px} .age b{display:block;font-size:13px}
    @media print{body{padding:10mm}}
  </style></head><body>
  <div class="top"><div><h1>${esc(company?.legalName || company?.name || 'Creative Carbon Composites')}</h1><div class="muted">${esc(company?.address ?? '')}</div>${company?.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}</div>` : ''}</div><div style="text-align:right"><div class="muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Statement of account</div><strong>${esc(customerName)}</strong><div class="muted">As on ${day(statement.asOf)}</div></div></div>
  <table><thead><tr><th>Date</th><th>Ref.</th><th>Particulars</th><th class="r">Debit ₹</th><th class="r">Credit ₹</th><th class="r">Balance ₹</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="age"><div>Not due<b>₹ ${money(a.current)}</b></div><div>1–30 days<b>₹ ${money(a.d1_30)}</b></div><div>31–60 days<b>₹ ${money(a.d31_60)}</b></div><div>61–90 days<b>₹ ${money(a.d61_90)}</b></div><div>Over 90 days<b>₹ ${money(a.d90)}</b></div></div>
  <p><strong>Balance ${statement.summary.balance >= 0 ? 'receivable' : 'advance held'}: ₹ ${money(Math.abs(statement.summary.balance))}</strong></p>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script></body></html>`)
  popup.document.close()
  return true
}

export function CustomerStatement({ customerId, customerName }: { customerId: string; customerName: string }) {
  const t = useT()
  const [statement, setStatement] = React.useState<Statement | null>(null)
  const [company, setCompany] = React.useState<CompanyView | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    Promise.all([apiCall<Statement>(`/api/cc_accounts/statement?customerId=${encodeURIComponent(customerId)}`), apiCall<CompanyView>('/api/cc_accounts/company')]).then(([call, companyCall]) => {
      if (!call.ok || !call.result) setFailed(true)
      else setStatement(call.result)
      setCompany(companyCall.ok ? (companyCall.result ?? null) : null)
    })
  }, [customerId])

  if (failed) return <p className="text-sm text-muted-foreground">{t('cc_accounts.st.noAccess', 'The account statement is not available for your role.')}</p>
  if (!statement) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }
  const s = statement.summary
  const tiles = [
    { label: t('cc_accounts.st.orderValue', 'Order value'), value: rupeeText(s.orderValue) },
    { label: t('cc_accounts.st.invoiced', 'Invoiced'), value: rupeeText(s.invoiced), hint: s.notInvoiced ? t('cc_accounts.st.notInvoiced', '{amount} not invoiced yet', { amount: rupeeText(s.notInvoiced) }) : null },
    { label: t('cc_accounts.st.received', 'Received'), value: rupeeText(s.received) },
    { label: s.balance >= 0 ? t('cc_accounts.st.receivable', 'Balance receivable') : t('cc_accounts.st.advanceHeld', 'Advance held'), value: rupeeText(Math.abs(s.balance)), tone: s.overdue > 0 ? 'bad' : null, hint: s.overdue ? t('cc_accounts.st.overdue', '{amount} overdue', { amount: rupeeText(s.overdue) }) : null },
  ]
  const buckets: Array<[string, number]> = [
    [t('cc_accounts.st.current', 'Not due'), statement.ageing.current],
    ['1–30 d', statement.ageing.d1_30],
    ['31–60 d', statement.ageing.d31_60],
    ['61–90 d', statement.ageing.d61_90],
    ['90+ d', statement.ageing.d90],
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('cc_accounts.st.title', 'Account statement')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => (printStatement(customerName, statement, company) ? null : flash(t('cc_accounts.st.popup', 'Allow pop-ups to print'), 'error'))} disabled={!statement.entries.length}>
          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('cc_accounts.st.print', 'Print statement')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn('rounded-lg border p-3', tile.tone === 'bad' ? 'border-status-error-border bg-status-error-bg' : 'bg-card')}>
            <p className="text-lg font-bold tabular-nums">{tile.value}</p>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            {tile.hint ? <p className={cn('text-xs', tile.tone === 'bad' ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>{tile.hint}</p> : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        {buckets.map(([label, amount], index) => (
          <div key={label} className={cn('rounded-md border p-2', amount > 0 && index > 0 ? 'border-status-warning-border bg-status-warning-bg' : 'bg-muted/30')}>
            <p className="font-semibold tabular-nums">{rupeeText(amount)}</p>
            <p className="text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {statement.openInvoices.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.st.openInv', 'Open invoice')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.st.due', 'Due')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.amount', 'Amount')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.paid', 'Paid')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.open', 'Open')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statement.openInvoices.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <Link href={`/backend/accounts/invoices/${row.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                      {row.code}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {row.orderNo} · {day(row.invoiceDate)}
                    </span>
                  </td>
                  <td className={cn('px-3 py-2 text-xs', row.daysOverdue > 0 && 'font-semibold text-status-error-text')}>
                    {day(row.dueDate)}
                    {row.daysOverdue > 0 ? ` · ${t('cc_accounts.st.late', '{days} d late', { days: row.daysOverdue })}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupeeText(row.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupeeText(row.paid)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupeeText(row.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {statement.entries.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.st.date', 'Date')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.st.particulars', 'Particulars')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.debit', 'Debit')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.credit', 'Credit')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.st.balance', 'Balance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statement.entries.map((entry) => (
                <tr key={`${entry.kind}-${entry.id}`}>
                  <td className="px-3 py-2 text-xs tabular-nums">{day(entry.date)}</td>
                  <td className="px-3 py-2">
                    <span className="block font-mono text-xs font-semibold">{entry.ref}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.detail} · {entry.orderNo}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{entry.debit ? rupeeText(entry.debit) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{entry.credit ? rupeeText(entry.credit) : ''}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupeeText(entry.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t('cc_accounts.st.empty', 'No invoices or payments yet.')}</p>
      )}
    </div>
  )
}

export default CustomerStatement
