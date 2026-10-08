"use client"

import * as React from 'react'
import { LoadingRegisterPage } from '../../../components/press/PressPages'

export default function CcPressLoadingPage() {
  return (
    <React.Suspense fallback={null}>
      <LoadingRegisterPage />
    </React.Suspense>
  )
}
