"use client"

import * as React from 'react'
import { PlanBoardPage } from '../../../components/plan/PlanBoardPage'

export default function CcPlanPageRoute() {
  return (
    <React.Suspense fallback={null}>
      <PlanBoardPage />
    </React.Suspense>
  )
}
