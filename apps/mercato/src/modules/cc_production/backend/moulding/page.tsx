"use client"

import * as React from 'react'
import { MouldingPage } from '../../components/moulding/MouldingPage'

export default function CcMouldingPage() {
  return (
    <React.Suspense fallback={null}>
      <MouldingPage />
    </React.Suspense>
  )
}
