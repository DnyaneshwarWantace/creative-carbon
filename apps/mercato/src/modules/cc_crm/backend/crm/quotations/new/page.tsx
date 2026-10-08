"use client"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { CcOrderForm as OrderForm } from '../../../../../cc_orders/components/CcOrderForm'

function NewQuotation() {
  const searchParams = useSearchParams()
  const enquiryId = searchParams?.get('enquiryId') ?? undefined
  const customerId = searchParams?.get('customerId') ?? undefined
  return <OrderForm key={`${enquiryId ?? ''}-${customerId ?? ''}`} quotation enquiryId={enquiryId} customerId={customerId} />
}

export default function CcNewQuotationPage() {
  return (
    <React.Suspense fallback={null}>
      <NewQuotation />
    </React.Suspense>
  )
}
