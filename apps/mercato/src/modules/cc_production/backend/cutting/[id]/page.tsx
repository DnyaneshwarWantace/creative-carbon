"use client"

import * as React from 'react'
import { CuttingDetailPage } from '../../../components/finishing/FinishingDetails'

export default function CcCuttingDetailPage({ params }: { params?: { id?: string } }) {
  return <CuttingDetailPage key={params?.id} recordId={params?.id ?? ''} />
}
