"use client"

import * as React from 'react'
import { ResinBatchEdit } from '../../../../../components/resin/ResinBatchForm'

export default function CcResinBatchEditPage({ params }: { params?: { id?: string } }) {
  return <ResinBatchEdit key={params?.id} batchId={params?.id ?? ''} />
}
