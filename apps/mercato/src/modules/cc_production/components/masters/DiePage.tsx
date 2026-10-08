"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardList, Factory, History, Pencil, Printer, Shapes } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, formatCount, formatDay, formatKg, type Fact } from '../../../cc_ui/components/RecordPage'
import { recordHref } from '../../../cc_ui/lib/links'

type DieView = {
  id: string
  dieNo: string
  mouldType: 'die' | 'plate'
  description: string | null
  size: string | null
  finish: string | null
  thicknessMm: number | null
  customerId: string | null
  customerName: string | null
  customerMouldNo: string | null
  storeLocation: string | null
  heatUpMinutes: number | null
  isActive: boolean
  updatedByName: string | null
  updatedAt: string
  product: { id: string; title: string; articleWeightKg: number | null } | null
  figures: { piecesThisMonth: number; kgThisMonth: number; piecesAllTime: number; lastUsed: string | null; shiftsRun: number }
  openOrders: Array<{ orderId: string; orderNo: string; orderDate: string; customerName: string | null; quantity: number; made: number; short: number }>
  entries: Array<{
    id: string
    entryDate: string
    shift: number
    pressId: string
    pressNumber: number
    orderRef: string | null
    orderQty: number | null
    productionNos: number
    weightKg: number
    total: number
    operatorName: string | null
    status: string
    outputLotId: string | null
    outputLotNumber: string | null
  }>
}

const ENTRY_STATUS: Record<string, 'neutral' | 'success' | 'warning'> = { draft: 'warning', posted: 'success' }

export function DiePage({ dieId }: { dieId: string }) {
  const t = useT()
  const [die, setDie] = React.useState<DieView | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void apiCall<DieView>(`/api/cc_production/records/die?id=${encodeURIComponent(dieId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.die.loadError', 'Could not load this die.'))
      else setDie(call.result)
    })
  }, [dieId, t])

  if (error || !die) return <RecordState error={error} loadingLabel={t('cc_production.die.loading', 'Loading die…')} />

  const shortTotal = die.openOrders.reduce((sum, order) => sum + order.short, 0)
  const facts: Fact[] = [
    { label: t('cc_production.die.monthPieces', 'Made this month'), value: `${formatCount(die.figures.piecesThisMonth)} ${t('cc_ui.pcs', 'pcs')}`, hint: `${formatKg(die.figures.kgThisMonth)} kg` },
    { label: t('cc_production.die.allPieces', 'Made in all'), value: formatCount(die.figures.piecesAllTime), hint: t('cc_production.die.shifts', '{count} shifts', { count: die.figures.shiftsRun }) },
    { label: t('cc_production.die.lastUsed', 'Last used'), value: formatDay(die.figures.lastUsed) },
    { label: t('cc_production.die.openOrders', 'Open orders'), value: formatCount(die.openOrders.length) },
    { label: t('cc_production.die.short', 'Still to make'), value: formatCount(shortTotal), tone: shortTotal ? 'warn' : undefined },
    { label: t('cc_production.die.weight', 'Article weight'), value: die.product?.articleWeightKg ? `${formatKg(die.product.articleWeightKg)} kg` : '—' },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/masters/moulds', label: t('cc_production.nav.moulds', 'Moulds & dies') }}
      overline={`${die.mouldType === 'plate' ? t('cc_production.die.plate', 'Plate') : t('cc_production.die.die', 'Die')}${die.customerName ? ` · ${die.customerName}` : ''}`}
      title={die.dieNo}
      badges={
        <>
          {die.isActive ? <StatusBadge variant="success">{t('cc_production.die.active', 'In use')}</StatusBadge> : <StatusBadge variant="neutral">{t('cc_production.die.inactive', 'Not in use')}</StatusBadge>}
          {die.finish ? <StatusBadge variant="info">{die.finish}</StatusBadge> : null}
        </>
      }
      meta={die.updatedByName ? t('cc_production.die.updated', 'Last changed by {name}', { name: die.updatedByName }) : undefined}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_production.die.print', 'Print')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/backend/moulding/dies`}>
              <Factory className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.die.availability', 'Die availability')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/backend/masters/moulds?search=${encodeURIComponent(die.dieNo)}`}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.die.edit', 'Edit in master')}
            </Link>
          </Button>
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.die.details', 'Die details')} icon={Shapes}>
              <FieldList
                fields={[
                  [t('cc_production.die.dieNo', 'Die No.'), die.dieNo],
                  [t('cc_production.die.type', 'Type'), die.mouldType === 'plate' ? t('cc_production.die.plate', 'Plate') : t('cc_production.die.die', 'Die')],
                  [t('cc_production.die.description', 'Description'), die.description],
                  [t('cc_production.die.size', 'Size'), die.size],
                  [t('cc_production.die.finish', 'Finish'), die.finish],
                  [t('cc_production.die.thickness', 'Thickness'), die.thicknessMm !== null ? `${die.thicknessMm} mm` : null],
                  [
                    t('cc_production.die.customer', 'Customer'),
                    die.customerId ? (
                      <Link className="underline-offset-2 hover:underline" href={recordHref.customer(die.customerId)}>
                        {die.customerName ?? '—'}
                      </Link>
                    ) : null,
                  ],
                  [t('cc_production.die.customerMouldNo', 'Customer mould No.'), die.customerMouldNo],
                  [t('cc_production.die.store', 'Kept at'), die.storeLocation],
                  [t('cc_production.die.heatUp', 'Heat-up time'), die.heatUpMinutes !== null ? `${die.heatUpMinutes} min` : null],
                  [
                    t('cc_production.die.product', 'Moulded part'),
                    die.product ? (
                      <Link className="underline-offset-2 hover:underline" href={recordHref.product(die.product.id)}>
                        {die.product.title}
                      </Link>
                    ) : null,
                  ],
                ]}
              />
            </Panel>

            <Panel title={t('cc_production.die.entries', 'Moulding register on this die')} icon={History} count={die.entries.length} flush>
              <RegisterGrid
                rows={die.entries}
                rowKey={(row) => row.id}
                rowHref={(row) => recordHref.mouldingEntry(row.id)}
                empty={t('cc_production.die.noEntries', 'This die has not been used in the moulding register yet.')}
                columns={[
                  { key: 'date', label: t('cc_production.die.date', 'Date'), render: (row) => `${formatDay(row.entryDate)} · S${row.shift}` },
                  {
                    key: 'machine',
                    label: t('cc_production.die.machine', 'Machine'),
                    render: (row) => (
                      <Link className="underline-offset-2 hover:underline" href={recordHref.machine('press', row.pressId)}>
                        {row.pressNumber}
                      </Link>
                    ),
                  },
                  { key: 'order', label: t('cc_production.die.order', 'Order'), mono: true, render: (row) => row.orderRef ?? (row.orderQty ? formatCount(row.orderQty) : '—') },
                  { key: 'operator', label: t('cc_production.die.operator', 'Operator'), render: (row) => row.operatorName ?? '—' },
                  {
                    key: 'lot',
                    label: t('cc_production.die.lot', 'Lot No.'),
                    mono: true,
                    render: (row) =>
                      row.outputLotId ? (
                        <Link className="underline-offset-2 hover:underline" href={recordHref.lot(row.outputLotId)}>
                          {row.outputLotNumber ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                  { key: 'status', label: t('cc_production.die.status', 'Status'), render: (row) => <StatusBadge variant={ENTRY_STATUS[row.status] ?? 'neutral'}>{t(`cc_production.moulding.status.${row.status}`, row.status)}</StatusBadge> },
                  { key: 'nos', label: t('cc_production.die.shiftNos', 'This shift'), align: 'right', render: (row) => formatCount(row.productionNos), total: formatCount(die.entries.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.productionNos, 0)) },
                  { key: 'total', label: t('cc_production.die.runningTotal', 'Total'), align: 'right', render: (row) => formatCount(row.total) },
                  { key: 'kg', label: 'kg', align: 'right', render: (row) => formatKg(row.weightKg), total: formatKg(die.entries.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.weightKg, 0)) },
                ]}
              />
            </Panel>
          </>
        }
        side={
          <Panel title={t('cc_production.die.ordersPanel', 'Open orders for this die')} icon={ClipboardList} count={die.openOrders.length} flush>
            <LinkRows
              empty={t('cc_production.die.noOrders', 'No open order names this die.')}
              rows={die.openOrders.map((order) => ({
                key: order.orderId,
                href: recordHref.order(order.orderId),
                primary: <span className="font-mono">{order.orderNo}</span>,
                secondary: [order.customerName, formatDay(order.orderDate)].filter(Boolean).join(' · '),
                value: `${formatCount(order.made)} / ${formatCount(order.quantity)}`,
                valueHint: order.short ? t('cc_production.die.toMake', '{count} to make', { count: formatCount(order.short) }) : t('cc_production.die.complete', 'made in full'),
              }))}
            />
          </Panel>
        }
      />
    </RecordPage>
  )
}

export default DiePage
