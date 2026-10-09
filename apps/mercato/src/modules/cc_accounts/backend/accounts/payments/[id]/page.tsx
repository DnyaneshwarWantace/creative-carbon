"use client"

import * as React from 'react'
import { PaymentPage } from '../../../../components/AccountRecords'

export default function CcPaymentPage({ params }: { params?: { id?: string } }) {
  return <PaymentPage key={params?.id} paymentId={params?.id ?? ''} />
}
