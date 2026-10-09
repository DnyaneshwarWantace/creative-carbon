"use client"

import * as React from 'react'
import { FileCheck2, Package, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { buildDocHtml, buildTcCoverHtml, type DocCompany, type PrintFulfilment } from './printDocs'
import type { Order } from './types'

export function OrderPrintButtons({ order }: { order: Order }) {
  const t = useT()
  const [company, setCompany] = React.useState<DocCompany | null>(null)

  React.useEffect(() => {
    void apiCall<DocCompany>('/api/cc_accounts/company', undefined, { fallback: null }).then((call) => setCompany(call.ok ? (call.result ?? null) : null))
  }, [])

  const print = async (build: (fulfilment: PrintFulfilment) => string, needsFulfilment: boolean) => {
    const popup = window.open('', '_blank', 'width=960,height=1100')
    if (!popup) {
      flash(t('cc_orders.money.popup', 'Allow pop-ups to print'), 'error')
      return
    }
    popup.document.write(`<p style="font-family:sans-serif;padding:24px">${t('cc_orders.money.preparing', 'Preparing…')}</p>`)
    const call = needsFulfilment ? await apiCall<PrintFulfilment>(`/api/cc_orders/orders/fulfilment?id=${order.id}`) : null
    popup.document.open()
    popup.document.write(build(call?.result ?? { lines: [] }))
    popup.document.close()
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void print(() => buildDocHtml(order, 'challan', company), false)}>
        <Truck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('cc_orders.money.challan', 'Delivery challan')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void print((fulfilment) => buildDocHtml(order, 'packing_list', company, fulfilment), true)}>
        <Package className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('cc_orders.money.packingList', 'Packing list')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void print((fulfilment) => buildTcCoverHtml(order, fulfilment, company), true)}>
        <FileCheck2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('cc_orders.money.tc', 'Test certificate')}
      </Button>
    </>
  )
}

export default OrderPrintButtons
