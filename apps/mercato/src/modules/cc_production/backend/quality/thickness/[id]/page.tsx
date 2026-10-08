"use client"

import * as React from 'react'
import { ThicknessDetailPage } from '../../../../components/finishing/FinishingDetails'

export default function CcThicknessDetailPage({ params }: { params?: { id?: string } }) {
  return <ThicknessDetailPage key={params?.id} recordId={params?.id ?? ''} />
}
