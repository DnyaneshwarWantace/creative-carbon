"use client"

import * as React from 'react'
import { PlantTodayPage as OwnerOverviewPage } from '../../components/owner/PlantTodayPage'

export default function CcOwnerOverviewPageRoute() {
  return (
    <React.Suspense fallback={null}>
      <OwnerOverviewPage />
    </React.Suspense>
  )
}
