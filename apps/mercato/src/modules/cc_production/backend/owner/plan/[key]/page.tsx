"use client"

import * as React from 'react'
import { PlanDetailPage } from '../../../../components/owner/PlanDetail'

export default function CcPlanDetailPage({ params }: { params?: { key?: string } }) {
  return <PlanDetailPage key={params?.key} planKey={params?.key ?? ''} />
}
