"use client"

import * as React from 'react'
import Link from 'next/link'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { LINE_SPEC_SECTIONS } from '../../lib/specs'
import { stageDef, stepStates } from '../../lib/stages'
import { formatDate, formatQty } from '../format'
import type { OrderMaterials } from '../useOrderMaterials'
import type { Order, Stage } from '../types'
import { useStageSettings } from '../useStageSettings'
import { paymentTermLabel } from '../../../dermat_lists/lib/paymentTerms'

const KIND_LABEL: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG' }


function stageValue(stage: Stage | undefined, key: string): string | null {
  const value = stage?.data?.[key]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

function orderValue(order: Order): number | null {
  const priced = order.lines.filter((line) => line.rate != null)
  if (!priced.length) return null
  return priced.reduce((sum, line) => sum + line.quantity * (line.rate ?? 0), 0)
}

function money(value: number | null): string {
  return value == null ? '—' : `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-1.5 text-sm">
      <dt className="col-span-2 text-muted-foreground">{label}</dt>
      <dd className="col-span-3 min-w-0 break-words">{children}</dd>
    </div>
  )
}

function MaterialsTable({ materials }: { materials: OrderMaterials | null }) {
  const t = useT()
  useStageSettings()
  if (!materials) return <p className="text-sm text-muted-foreground">{t('dermat_orders.view.materialsLoading', 'Working out materials…')}</p>
  if (!materials.rows.length) return <p className="text-sm text-muted-foreground">{t('dermat_orders.view.noMaterials', 'Materials appear once the products have a BOM.')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="pb-2 text-left">{t('dermat_orders.view.material', 'Material')}</th>
            <th className="pb-2 text-right">{t('dermat_orders.view.need', 'Needed')}</th>
            <th className="pb-2 text-right">{t('dermat_orders.view.onHand', 'On hand')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {materials.rows.map((row) => {
            const short = row.quantity > row.onHand
            return (
              <tr key={row.productId}>
                <td className="py-1.5 pr-2">
                  <span className="mr-1.5 rounded border px-1 text-xs">{KIND_LABEL[row.kind ?? ''] ?? row.kind}</span>
                  <Link href={`/backend/products/${row.productId}`} className="hover:underline">
                    {row.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{row.code}</span> : null}
                    {row.name}
                  </Link>
                </td>
                <td className="py-1.5 text-right font-mono">
                  {formatQty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                </td>
                <td className={cn('py-1.5 text-right font-mono', short && 'font-semibold text-status-error-text')}>
                  {formatQty(row.onHand)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SpecsBlock({ order, sections }: { order: Order; sections: Array<'production' | 'primary' | 'secondary'> }) {
  return (
    <div className="space-y-4">
      {order.lines.map((line) => (
        <div key={line.id} className="space-y-2">
          <p className="text-sm font-medium">
            {line.product?.title ?? '—'} <span className="text-muted-foreground">· {formatQty(line.quantity, 0)} pcs</span>
          </p>
          {LINE_SPEC_SECTIONS.filter((section) => sections.includes(section.key)).map((section) => (
            <div key={section.key}>
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h4>
              <dl>
                {section.fields.map((field) => (
                  <Row key={field.key} label={field.label}>
                    {line.specs[section.key]?.[field.key] || '—'}
                  </Row>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PackingItems({ order }: { order: Order }) {
  const t = useT()
  useStageSettings()
  const [items, setItems] = React.useState<Record<string, Array<{ id: string; title: string; sku: string | null }>>>({})
  const productKey = order.lines.map((line) => line.productId).join(',')
  React.useEffect(() => {
    let cancelled = false
    Promise.all(
      order.lines.map(async (line) => {
        const call = await apiCall<{ items?: Array<{ id: string; title: string; sku: string | null }> }>(
          `/api/dermat_products/packing?productId=${encodeURIComponent(line.productId)}`,
          undefined,
          { fallback: { items: [] } },
        )
        return [line.productId, call.result?.items ?? []] as const
      }),
    ).then((entries) => {
      if (!cancelled) setItems(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey])
  return (
    <ul className="space-y-2 text-sm">
      {order.lines.map((line) => (
        <li key={line.id}>
          <span className="font-medium">{line.product?.title ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">
            {(items[line.productId] ?? []).length
              ? (items[line.productId] ?? []).map((item) => item.title.split(' - ')[0]).join(' · ')
              : t('dermat_orders.stagePage.noPacking', 'No packing items on the product yet')}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StageContext({ order, stage, materials }: { order: Order; stage: Stage; materials: OrderMaterials | null }) {
  const t = useT()
  useStageSettings()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  const value = orderValue(order)
  const advanceAmount = Number(stageValue(byKey.get('advance'), 'advance_amount') ?? 0) || null
  switch (stage.key) {
    case 'advance':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('dermat_orders.stagePage.expected', 'Expected advance (40%)')}>{money(value == null ? null : value * 0.4)}</Row>
          <Row label={t('dermat_orders.view.payment', 'Payment')}>
            {[paymentTermLabel(order.paymentTerms), order.paymentRemarks].filter(Boolean).join(' · ') || '—'}
          </Row>
          <Row label={t('dermat_orders.stagePage.gstin', 'Customer GSTIN')}>{order.customer?.gstin ?? '—'}</Row>
        </dl>
      )
    case 'sampling':
      return <SpecsBlock order={order} sections={['production']} />
    case 'artwork':
      return (
        <div className="space-y-4">
          <div>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('dermat_orders.stagePage.packingItems', 'Packing items per product')}</h4>
            <PackingItems order={order} />
          </div>
          <SpecsBlock order={order} sections={['primary', 'secondary']} />
        </div>
      )
    case 'formulation':
      return (
        <ul className="divide-y text-sm">
          {order.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{line.product?.title ?? '—'}</span>
              {line.bom ? (
                <Link href={`/backend/boms/${line.bom.id}`} className="shrink-0 hover:underline">
                  <StatusBadge variant={line.bom.status === 'approved' ? 'success' : 'warning'}>
                    {`BOM v${line.bom.version} · ${line.bom.status}`}
                  </StatusBadge>
                </Link>
              ) : (
                <Link href={`/backend/boms/new?productId=${line.productId}`} className="shrink-0 text-xs text-status-warning-text hover:underline">
                  {t('dermat_orders.sheet.makeBom', 'Make BOM')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )
    case 'planning':
    case 'manufacturing':
      return (
        <div className="space-y-3">
          <dl className="divide-y">
            {order.lines.map((line) => (
              <Row key={line.id} label={line.product?.title ?? '—'}>
                {formatQty(line.quantity, 0)} pcs
                {materials?.bulkByLine[line.id] ? ` → ${formatQty(materials.bulkByLine[line.id], 2)} kg bulk` : ''}
              </Row>
            ))}
          </dl>
          <MaterialsTable materials={materials} />
        </div>
      )
    case 'filling':
    case 'packing':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.batch', 'Batch no.')}>{stageValue(byKey.get('manufacturing'), 'batch_no') ?? '—'}</Row>
          <Row label={t('dermat_orders.stagePage.bulkMade', 'Bulk made')}>
            {stageValue(byKey.get('manufacturing'), 'batch_size') ? `${stageValue(byKey.get('manufacturing'), 'batch_size')} kg` : '—'}
          </Row>
          {stage.key === 'packing' ? (
            <Row label={t('dermat_orders.stagePage.filled', 'Units filled')}>{stageValue(byKey.get('filling'), 'filled_units') ?? '—'}</Row>
          ) : null}
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {formatQty(line.quantity, 0)} pcs · {line.packSize ?? '—'}
            </Row>
          ))}
        </dl>
      )
    case 'qc_qa':
      return (
        <dl className="divide-y">
          {(['manufacturing', 'filling', 'packing'] as const).map((key) => {
            const entry = byKey.get(key)
            const def = stageDef(key)
            const ticked = def ? def.steps.filter((step) => stepStates(entry?.data)[step.key]?.done).length : 0
            return (
              <Row key={key} label={def?.label ?? key}>
                {entry?.status === 'done'
                  ? `${t('dermat_orders.stagePage.doneBy', 'Done by {name}', { name: entry.completedByName ?? '—' })} · ${ticked}/${def?.steps.length ?? 0} ${t('dermat_orders.stagePage.steps', 'steps')}`
                  : t(`dermat_orders.stageStatus.${entry?.status ?? 'waiting'}`, entry?.status ?? 'waiting')}
              </Row>
            )
          })}
          <Row label={t('dermat_orders.stagePage.packed', 'Packed')}>{stageValue(byKey.get('packing'), 'packed_qty') ?? '—'} pcs</Row>
        </dl>
      )
    case 'billing':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('dermat_orders.stagePage.advance', 'Advance received')}>{money(advanceAmount)}</Row>
          <Row label={t('dermat_orders.stagePage.balance', 'Balance to collect')}>{money(value == null ? null : value - (advanceAmount ?? 0))}</Row>
          <Row label={t('dermat_orders.form.billingRemarks', 'Billing remarks')}>{order.billingRemarks ?? '—'}</Row>
        </dl>
      )
    case 'dispatch':
      return (
        <dl className="divide-y">
          <Row label={t('dermat_orders.stagePage.invoice', 'Invoice')}>
            {[stageValue(byKey.get('billing'), 'invoice_number'), formatDate(stageValue(byKey.get('billing'), 'invoice_date'))].filter((part) => part && part !== '—').join(' · ') || '—'}
          </Row>
          <Row label={t('dermat_orders.stagePage.balanceStatus', 'Balance payment')}>{stageValue(byKey.get('billing'), 'balance_status') ?? '—'}</Row>
          <Row label={t('dermat_orders.stagePage.contact', 'Customer contact')}>{[order.customer?.phone, order.customer?.email].filter(Boolean).join(' · ') || '—'}</Row>
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {formatQty(line.quantity, 0)} pcs
            </Row>
          ))}
          <Row label={t('dermat_orders.form.packingRemarks', 'Packing remarks')}>{order.packingRemarks ?? '—'}</Row>
        </dl>
      )
    default:
      return <p className="text-sm text-muted-foreground">{t('dermat_orders.stagePage.nothing', 'Everything for this stage is in the form.')}</p>
  }
}
