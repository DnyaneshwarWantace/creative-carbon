"use client"

import * as React from 'react'
import { PressBatchPage } from '../../../../components/press/PressBatchPage'

export default function CcPressBatchPage({ params }: { params?: { id?: string } }) {
  return <PressBatchPage key={params?.id} batchId={params?.id ?? ''} />
}
