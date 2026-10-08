"use client"

import * as React from 'react'
import { CoatingDayPage } from '../../components/coating/CoatingDayPage'

export default function CcCoatingPage() {
  return (
    <React.Suspense fallback={null}>
      <CoatingDayPage />
    </React.Suspense>
  )
}
