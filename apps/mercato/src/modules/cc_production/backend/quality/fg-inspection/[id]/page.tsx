"use client"

import * as React from 'react'
import { FgReportDetailPage } from '../../../../components/finishing/FinishingDetails'

export default function CcFgReportDetailPage({ params }: { params?: { id?: string } }) {
  return <FgReportDetailPage key={params?.id} recordId={params?.id ?? ''} />
}
