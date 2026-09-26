"use client"

import * as React from 'react'
import { InvoicePage } from '../../../../components/InvoicePage'

export default function DermatInvoicePage({ params }: { params?: { id?: string } }) {
  return <InvoicePage key={params?.id} id={params?.id ?? ''} />
}
