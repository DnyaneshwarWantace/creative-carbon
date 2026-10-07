"use client"

import * as React from 'react'
import { StagePage } from '../../../../../components/StagePage'

export default function CcOrderStagePage({ params }: { params?: { id?: string; key?: string } }) {
  return <StagePage key={`${params?.id}-${params?.key}`} orderId={params?.id ?? ''} stageKey={params?.key ?? ''} />
}
