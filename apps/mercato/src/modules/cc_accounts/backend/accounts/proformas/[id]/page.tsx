"use client"

import * as React from 'react'
import { ProformaPage } from '../../../../components/ProformaPage'

export default function CcProformaPage({ params }: { params?: { id?: string } }) {
  return <ProformaPage key={params?.id} id={params?.id ?? ''} />
}
