"use client"

import * as React from 'react'
import { ResinBatchPage } from '../../../../components/resin/ResinBatchPage'

export default function CcResinBatchPage({ params }: { params?: { id?: string } }) {
  return <ResinBatchPage key={params?.id} batchId={params?.id ?? ''} />
}
