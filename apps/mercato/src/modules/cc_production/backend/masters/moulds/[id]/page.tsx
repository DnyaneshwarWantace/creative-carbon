"use client"

import * as React from 'react'
import { DiePage } from '../../../../components/masters/DiePage'

export default function CcDiePage({ params }: { params?: { id?: string } }) {
  return <DiePage key={params?.id} dieId={params?.id ?? ''} />
}
