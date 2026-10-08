"use client"

import * as React from 'react'
import { LabFormPage } from '../../../../../components/lab/LabPages'

export default function CcEditLabTestPage({ params }: { params?: { id?: string } }) {
  return <LabFormPage key={params?.id} testId={params?.id ?? ''} />
}
