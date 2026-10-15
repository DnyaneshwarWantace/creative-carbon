"use client"

import * as React from 'react'
import { StockPage } from '../../../components/StockPage'

export default function CcRawMaterialStockPage() {
  return (
    <React.Suspense fallback={null}>
      <StockPage places={['wh_a', 'wh_b', 'tank', 'floor']} basePath="/backend/store/raw-stock" />
    </React.Suspense>
  )
}
