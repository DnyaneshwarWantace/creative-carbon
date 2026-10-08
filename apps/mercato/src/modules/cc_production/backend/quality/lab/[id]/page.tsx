"use client"

import * as React from 'react'
import { LabDetailPage } from '../../../../components/lab/LabPages'

export default function CcLabTestPage({ params }: { params?: { id?: string } }) {
  return <LabDetailPage key={params?.id} testId={params?.id ?? ''} />
}
