"use client"

import * as React from 'react'
import { BomEditor } from '../../../components/BomEditor'

export default function DermatBomDetailPage({ params }: { params?: { id?: string } }) {
  return <BomEditor key={params?.id} bomId={params?.id ?? ''} />
}
