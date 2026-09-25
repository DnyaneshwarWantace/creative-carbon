"use client"

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { BomEditor } from '../../../components/BomEditor'

function NewBom() {
  const searchParams = useSearchParams()
  const productId = searchParams?.get('productId') ?? undefined
  return <BomEditor key={productId ?? 'pick'} productId={productId} />
}

export default function NewDermatBomPage() {
  return (
    <React.Suspense fallback={null}>
      <NewBom />
    </React.Suspense>
  )
}
