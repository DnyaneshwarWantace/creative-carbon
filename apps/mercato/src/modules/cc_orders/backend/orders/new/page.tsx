"use client"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { OrderForm } from '../../../components/OrderForm'

function NewOrder() {
  const searchParams = useSearchParams()
  const copyFrom = searchParams?.get('copyFrom') ?? undefined
  const customerId = searchParams?.get('customerId') ?? undefined
  return <OrderForm key={copyFrom ?? customerId ?? 'new'} copyFrom={copyFrom} customerId={customerId} />
}

export default function NewCcOrderPage() {
  return (
    <React.Suspense fallback={null}>
      <NewOrder />
    </React.Suspense>
  )
}
