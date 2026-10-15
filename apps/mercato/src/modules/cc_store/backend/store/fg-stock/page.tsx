"use client"

import * as React from 'react'
import { StockPage } from '../../../components/StockPage'

export default function CcFinishedGoodsStockPage() {
  return (
    <React.Suspense fallback={null}>
      <StockPage places={['fg', 'jobwork']} basePath="/backend/store/fg-stock" />
    </React.Suspense>
  )
}
