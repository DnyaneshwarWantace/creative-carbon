"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardList, FileStack, Pencil, Printer, ShoppingCart } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { HISTORY_LABEL, day, qty } from './shared'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'

type IndentStatus = 'submitted' | 'approved' | 'rejected' | 'ordered' | 'cancelled'

type IndentView = {
  id: string
  code: string
  status: IndentStatus
  source: string
  department: string | null
  neededBy: string | null
  notes: string | null
  orderRefs: Array<{ orderId: string; orderNo: string }>
  requestedByName: string | null
  approvedByName: string | null
  decisionNote: string | null
  poRefs: Array<{ poId: string; code: string }>
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  createdAt: string
  updatedAt: string
  lines: Array<{ productId: string; quantity: number; unit: string | null; note: string | null; title: string; code: string | null }>
}

const STATUS: Record<IndentStatus, { label: string; variant: StatusBadgeVariant }> = {
  submitted: { label: 'Waiting for approval', variant: 'warning' },
  approved: { label: 'Approved, to order', variant: 'info' },
  ordered: { label: 'PO raised', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

const SOURCE: Record<string, string> = { department: 'Department', planning: 'Planning shortage', low_stock: 'Low stock (reorder level)' }

function poHref(indent: IndentView): string {
  const totals = new Map<string, number>()
  for (const line of indent.lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity)
  const query = new URLSearchParams({ items: [...totals.entries()].map(([id, amount]) => `${id}:${amount}`).join(','), indents: indent.id })
  if (indent.orderRefs.length) query.set('orders', indent.orderRefs.map((ref) => `${ref.orderId}:${encodeURIComponent(ref.orderNo)}`).join(','))
  return `/backend/purchase/orders/new?${query.toString()}`
}

export function IndentPage({ indentId }: { indentId: string }) {
  const t = useT()
  const granted = useGranted()
  const [indent, setIndent] = React.useState<IndentView | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void apiCall<IndentView>(`/api/cc_purchase/indents?id=${encodeURIComponent(indentId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_purchase.indent.loadError', 'Could not load this indent.'))
      else setIndent(call.result)
    })
  }, [indentId, t])

  if (error || !indent) return <RecordState error={error} loadingLabel={t('cc_purchase.indent.loading', 'Loading indent…')} />

  const status = STATUS[indent.status]
  const facts: Fact[] = [
    { label: t('cc_purchase.indent.raised', 'Raised'), value: day(indent.createdAt) },
    { label: t('cc_purchase.indent.neededBy', 'Needed by'), value: day(indent.neededBy), tone: indent.neededBy && indent.neededBy < new Date().toISOString().slice(0, 10) && indent.status !== 'ordered' ? 'bad' : undefined },
    { label: t('cc_purchase.indent.items', 'Items'), value: String(indent.lines.length) },
    { label: t('cc_purchase.indent.source', 'Why'), value: t(`cc_purchase.indent.source.${indent.source}`, SOURCE[indent.source] ?? indent.source) },
    { label: t('cc_purchase.indent.department', 'Department'), value: indent.department ?? '—' },
    { label: t('cc_purchase.indent.pos', 'POs'), value: String(indent.poRefs.length), tone: indent.poRefs.length ? 'good' : undefined },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/purchase/indents', label: t('cc_purchase.nav.indents', 'Purchase indents') }}
      overline={t('cc_purchase.indent.overline', 'Purchase indent')}
      title={indent.code}
      badges={
        <StatusBadge variant={status.variant} dot>
          {t(`cc_purchase.indent.status.${indent.status}`, status.label)}
        </StatusBadge>
      }
      meta={[indent.requestedByName ? t('cc_purchase.indent.by', 'Asked for by {name}', { name: indent.requestedByName }) : null, indent.approvedByName ? t('cc_purchase.indent.decidedBy', 'decided by {name}', { name: indent.approvedByName }) : null].filter(Boolean).join(' · ')}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_purchase.indent.print', 'Print')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/backend/purchase/indents?id=${indent.id}`}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_purchase.indent.openInList', 'Approve / order in the list')}
            </Link>
          </Button>
          {indent.status === 'approved' && granted.has('cc_purchase.manage') ? (
            <Button asChild size="sm">
              <Link href={poHref(indent)}>
                <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.indent.raisePo', 'Raise PO')}
              </Link>
            </Button>
          ) : null}
        </>
      }
      alert={indent.decisionNote ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{indent.decisionNote}</p> : null}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_purchase.indent.lines', 'Items asked for')} icon={ClipboardList} count={indent.lines.length} flush>
              <RegisterGrid
                rows={indent.lines}
                rowKey={(line) => line.productId}
                rowHref={(line) => recordHref.product(line.productId)}
                empty={t('cc_purchase.indent.noLines', 'No items.')}
                columns={[
                  { key: 'item', label: t('cc_purchase.indent.item', 'Item'), render: (line) => line.title },
                  { key: 'code', label: t('cc_purchase.indent.code', 'Code'), mono: true, render: (line) => line.code ?? '—' },
                  { key: 'note', label: t('cc_purchase.indent.note', 'Note'), render: (line) => line.note ?? '—' },
                  { key: 'qty', label: t('cc_purchase.indent.qty', 'Qty'), align: 'right', render: (line) => qty(line.quantity, line.unit) },
                ]}
              />
            </Panel>
            {indent.notes ? (
              <Panel title={t('cc_purchase.indent.notes', 'Notes')}>
                <p className="whitespace-pre-wrap text-sm">{indent.notes}</p>
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title={t('cc_purchase.indent.wentTo', 'Went to · purchase orders')} icon={FileStack} count={indent.poRefs.length} flush>
              <LinkRows empty={t('cc_purchase.indent.noPo', 'No PO raised from this indent yet.')} rows={indent.poRefs.map((po) => ({ key: po.poId, href: recordHref.purchaseOrder(po.poId), primary: <span className="font-mono">{po.code}</span> }))} />
            </Panel>
            {indent.orderRefs.length ? (
              <Panel title={t('cc_purchase.indent.forOrders', 'For customer orders')} icon={ClipboardList} count={indent.orderRefs.length} flush>
                <LinkRows empty={null} rows={indent.orderRefs.map((order) => ({ key: order.orderId, href: recordHref.order(order.orderId), primary: <span className="font-mono">{order.orderNo}</span> }))} />
              </Panel>
            ) : null}
            <Panel title={t('cc_purchase.indent.details', 'Details')}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_purchase.indent.source', 'Why'), t(`cc_purchase.indent.source.${indent.source}`, SOURCE[indent.source] ?? indent.source)],
                  [t('cc_purchase.indent.department', 'Department'), indent.department],
                  [t('cc_purchase.indent.requestedBy', 'Asked for by'), indent.requestedByName],
                  [t('cc_purchase.indent.approvedBy', 'Decided by'), indent.approvedByName],
                ]}
              />
            </Panel>
          </>
        }
      />
      <Attachments type="indent" id={indent.id} />
      <Comments type="indent" id={indent.id} />
      <Timeline type="indent" id={indent.id} refreshKey={indent.history.length} />
    </RecordPage>
  )
}

export default IndentPage
