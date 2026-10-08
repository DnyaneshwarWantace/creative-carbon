"use client"

import * as React from 'react'
import { PressBatchEdit } from '../../../../../components/press/PressBatchForm'

export default function CcPressBatchEditPage({ params }: { params?: { id?: string } }) {
  return <PressBatchEdit key={params?.id} batchId={params?.id ?? ''} />
}
