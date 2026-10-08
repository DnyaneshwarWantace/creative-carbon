"use client"

import * as React from 'react'
import { StockGridPage } from '../../components/owner/OwnerPages'

export default function CcStockGridPageRoute() {
  return (
    <React.Suspense fallback={null}>
      <StockGridPage />
    </React.Suspense>
  )
}
