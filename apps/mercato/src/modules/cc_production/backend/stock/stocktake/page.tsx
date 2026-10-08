"use client"

import * as React from 'react'
import { StocktakePage } from '../../../components/owner/OwnerPages'

export default function CcStocktakePageRoute() {
  return (
    <React.Suspense fallback={null}>
      <StocktakePage />
    </React.Suspense>
  )
}
