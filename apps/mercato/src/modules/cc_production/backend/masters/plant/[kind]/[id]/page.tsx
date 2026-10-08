"use client"

import * as React from 'react'
import { MachinePage } from '../../../../../components/masters/MachinePage'

export default function CcMachinePage({ params }: { params?: { kind?: string; id?: string } }) {
  return <MachinePage key={`${params?.kind}-${params?.id}`} kind={params?.kind ?? ''} machineId={params?.id ?? ''} />
}
