"use client"

import * as React from 'react'
import { BatchPage } from '../../../../components/BatchPage'

export default function DermatBatchPage({ params }: { params?: { no?: string } }) {
  const batchNo = decodeURIComponent(params?.no ?? '')
  return <BatchPage key={batchNo} batchNo={batchNo} />
}
