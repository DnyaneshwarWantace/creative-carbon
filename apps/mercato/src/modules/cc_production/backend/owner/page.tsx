"use client"

import * as React from 'react'
import { OwnerOverviewPage } from '../../components/owner/OwnerPages'

export default function CcOwnerOverviewPageRoute() {
  return (
    <React.Suspense fallback={null}>
      <OwnerOverviewPage />
    </React.Suspense>
  )
}
