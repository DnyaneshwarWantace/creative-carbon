"use client"

import * as React from 'react'
import { DieAvailabilityPage } from '../../../components/moulding/MouldingExtras'

export default function CcDieAvailabilityPage() {
  return (
    <React.Suspense fallback={null}>
      <DieAvailabilityPage />
    </React.Suspense>
  )
}
