"use client"

import * as React from 'react'
import { ProductsPage } from '../../components/ProductsPage'
import { RAW_MATERIAL_KINDS } from '../../lib/kinds'

export default function CcRawMaterialPage() {
  return (
    <React.Suspense fallback={null}>
      <ProductsPage kinds={RAW_MATERIAL_KINDS} basePath="/backend/raw-material" />
    </React.Suspense>
  )
}
