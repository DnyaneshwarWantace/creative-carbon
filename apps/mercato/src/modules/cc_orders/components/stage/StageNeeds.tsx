"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { LINE_SPEC_SECTIONS, type SpecSectionKey } from '../../lib/specs'
import { formatDate, formatQty } from '../format'
import type { Order, Stage } from '../types'
import { useStageSettings } from '../useStageSettings'
import { paymentTermLabel } from '../../../cc_lists/lib/paymentTerms'

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

function lineQty(line: Order['lines'][number]): string {
  const pieces = line.specs.material?.pieces
  return `${formatQty(line.quantity, 3)} kg${pieces ? ` · ${pieces} pcs` : ''}`
}

function SpecsBlock({ order, sections }: { order: Order; sections: SpecSectionKey[] }) {
  return (
    <div className="space-y-4">
      {order.lines.map((line) => (
        <div key={line.id} className="space-y-2">
          <p className="text-sm font-medium">
            {line.product?.title ?? '—'} <span className="text-muted-foreground">· {lineQty(line)}</span>
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

export function StageContext({ order, stage }: { order: Order; stage: Stage }) {
  const t = useT()
  useStageSettings()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  const value = orderValue(order)
  const advanceAmount = Number(stageValue(byKey.get('advance'), 'advance_amount') ?? 0) || null
  switch (stage.key) {
    case 'advance':
      return (
        <dl className="divide-y">
          <Row label={t('cc_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('cc_orders.view.payment', 'Payment')}>
            {[paymentTermLabel(order.paymentTerms), order.paymentRemarks].filter(Boolean).join(' · ') || '—'}
          </Row>
          <Row label={t('cc_orders.stagePage.gstin', 'Customer GSTIN')}>{order.customer?.gstin ?? '—'}</Row>
        </dl>
      )
    case 'allocation':
      return <SpecsBlock order={order} sections={['material']} />
    case 'qc':
      return <SpecsBlock order={order} sections={['material', 'packing']} />
    case 'packing':
      return (
        <dl className="divide-y">
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {[line.specs.material?.sheet_size, line.specs.material?.thickness_mm ? `${line.specs.material.thickness_mm} mm` : null, lineQty(line)].filter(Boolean).join(' · ')}
              {line.specs.packing?.pack_type ? <span className="block text-xs text-muted-foreground">{line.specs.packing.pack_type}</span> : null}
            </Row>
          ))}
          <Row label={t('cc_orders.form.packingRemarks', 'Packing remarks')}>{order.packingRemarks ?? '—'}</Row>
        </dl>
      )
    case 'invoice':
      return (
        <dl className="divide-y">
          <Row label={t('cc_orders.stagePage.orderValue', 'Order value')}>{money(value)}</Row>
          <Row label={t('cc_orders.stagePage.advance', 'Advance received')}>{money(advanceAmount)}</Row>
          <Row label={t('cc_orders.stagePage.balance', 'Balance to collect')}>{money(value == null ? null : value - (advanceAmount ?? 0))}</Row>
          <Row label={t('cc_orders.stagePage.netKg', 'Net kg packed')}>{stageValue(byKey.get('packing'), 'net_kg') ?? '—'}</Row>
          <Row label={t('cc_orders.form.billingRemarks', 'Billing remarks')}>{order.billingRemarks ?? '—'}</Row>
        </dl>
      )
    case 'dispatch':
      return (
        <dl className="divide-y">
          <Row label={t('cc_orders.stagePage.invoice', 'Invoice')}>
            {[stageValue(byKey.get('invoice'), 'invoice_number'), formatDate(stageValue(byKey.get('invoice'), 'invoice_date'))].filter((part) => part && part !== '—').join(' · ') || '—'}
          </Row>
          <Row label={t('cc_orders.stagePage.packed', 'Packed')}>
            {[stageValue(byKey.get('packing'), 'pack_type'), stageValue(byKey.get('packing'), 'packages') ? `${stageValue(byKey.get('packing'), 'packages')} pallets / bundles` : null, stageValue(byKey.get('packing'), 'net_kg') ? `${stageValue(byKey.get('packing'), 'net_kg')} kg net` : null].filter(Boolean).join(' · ') || '—'}
          </Row>
          <Row label={t('cc_orders.stagePage.contact', 'Customer contact')}>{[order.customer?.phone, order.customer?.email].filter(Boolean).join(' · ') || '—'}</Row>
          {order.lines.map((line) => (
            <Row key={line.id} label={line.product?.title ?? '—'}>
              {lineQty(line)}
            </Row>
          ))}
        </dl>
      )
    default:
      return <p className="text-sm text-muted-foreground">{t('cc_orders.stagePage.nothing', 'Everything for this stage is in the form.')}</p>
  }
}
