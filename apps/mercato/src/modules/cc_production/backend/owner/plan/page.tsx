"use client"

import * as React from 'react'
import { PlanPage } from '../../../components/owner/OwnerPages'

export default function CcPlanPageRoute() {
  return (
    <React.Suspense fallback={null}>
      <PlanPage />
    </React.Suspense>
  )
}
