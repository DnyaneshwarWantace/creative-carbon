"use client"

import * as React from 'react'
import { GrnPage } from '../../../../components/GrnPage'

export default function DermatGrnPage({ params }: { params?: { id?: string } }) {
  return <GrnPage key={params?.id} grnId={params?.id ?? ''} />
}
