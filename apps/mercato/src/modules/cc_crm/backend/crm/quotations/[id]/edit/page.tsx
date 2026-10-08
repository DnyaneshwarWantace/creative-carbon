"use client"

import * as React from 'react'
import { OrderForm } from '../../../../../../cc_orders/components/OrderForm'

export default function CcEditQuotationPage({ params }: { params?: { id?: string } }) {
  return <OrderForm key={params?.id} quotationId={params?.id ?? ''} />
}
