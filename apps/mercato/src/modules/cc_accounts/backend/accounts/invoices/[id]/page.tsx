"use client"

import * as React from 'react'
import { InvoicePage } from '../../../../components/InvoicePage'

export default function CcInvoicePage({ params }: { params?: { id?: string } }) {
  return <InvoicePage key={params?.id} id={params?.id ?? ''} />
}
