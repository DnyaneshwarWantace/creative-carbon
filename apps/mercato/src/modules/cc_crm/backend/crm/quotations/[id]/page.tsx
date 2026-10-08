"use client"

import * as React from 'react'
import { QuotationPage } from '../../../../components/QuotationPage'

export default function CcQuotationPage({ params }: { params?: { id?: string } }) {
  return <QuotationPage key={params?.id} quotationId={params?.id ?? ''} />
}
