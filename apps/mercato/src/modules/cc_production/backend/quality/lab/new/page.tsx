"use client"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { LabFormPage } from '../../../../components/lab/LabPages'

function NewLabTest() {
  const searchParams = useSearchParams()
  const orderId = searchParams?.get('orderId') ?? undefined
  return <LabFormPage key={orderId ?? 'new'} orderId={orderId} />
}

export default function CcNewLabTestPage() {
  return (
    <React.Suspense fallback={null}>
      <NewLabTest />
    </React.Suspense>
  )
}
