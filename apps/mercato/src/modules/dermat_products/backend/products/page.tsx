"use client"

import * as React from 'react'
import { ProductsPage } from '../../components/ProductsPage'

export default function DermatProductsPage() {
  return (
    <React.Suspense fallback={null}>
      <ProductsPage />
    </React.Suspense>
  )
}
