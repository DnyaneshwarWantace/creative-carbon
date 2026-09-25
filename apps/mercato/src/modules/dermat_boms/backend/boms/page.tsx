"use client"

import * as React from 'react'
import { BomsPage } from '../../components/BomsPage'

export default function DermatBomsPage() {
  return (
    <React.Suspense fallback={null}>
      <BomsPage />
    </React.Suspense>
  )
}
