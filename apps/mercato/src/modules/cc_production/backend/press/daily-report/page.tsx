"use client"

import * as React from 'react'
import { DailyReportPage } from '../../../components/press/PressPages'

export default function CcPressDailyReportPage() {
  return (
    <React.Suspense fallback={null}>
      <DailyReportPage />
    </React.Suspense>
  )
}
