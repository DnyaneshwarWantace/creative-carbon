"use client"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { OrderForm } from '../../../components/OrderForm'

function NewOrder() {
  const searchParams = useSearchParams()
  const copyFrom = searchParams?.get('copyFrom') ?? undefined
  return <OrderForm key={copyFrom ?? 'new'} copyFrom={copyFrom} />
}

export default function NewDermatOrderPage() {
  return (
    <React.Suspense fallback={null}>
      <NewOrder />
    </React.Suspense>
  )
}
