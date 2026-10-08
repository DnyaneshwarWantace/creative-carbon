"use client"

import * as React from 'react'
import { DirectInDetailPage } from '../../../../components/finishing/FinishingDetails'

export default function CcDirectInDetailPage({ params }: { params?: { id?: string } }) {
  return <DirectInDetailPage key={params?.id} recordId={params?.id ?? ''} />
}
