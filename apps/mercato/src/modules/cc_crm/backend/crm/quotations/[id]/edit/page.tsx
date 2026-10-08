"use client"

import * as React from 'react'
import { CcOrderForm as OrderForm } from '../../../../../../cc_orders/components/CcOrderForm'

export default function CcEditQuotationPage({ params }: { params?: { id?: string } }) {
  return <OrderForm key={params?.id} quotationId={params?.id ?? ''} />
}
