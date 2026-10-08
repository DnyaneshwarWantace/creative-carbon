"use client"

import * as React from 'react'
import { DamageDetailPage } from '../../../../components/finishing/FinishingDetails'

export default function CcDamageDetailPage({ params }: { params?: { id?: string } }) {
  return <DamageDetailPage key={params?.id} recordId={params?.id ?? ''} />
}
