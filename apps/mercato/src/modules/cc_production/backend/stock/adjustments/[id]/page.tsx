"use client"

import * as React from 'react'
import { AdjustmentPage } from '../../../../components/owner/StoreRecords'

export default function CcAdjustmentPage({ params }: { params?: { id?: string } }) {
  return <AdjustmentPage key={params?.id} id={params?.id ?? ''} />
}
