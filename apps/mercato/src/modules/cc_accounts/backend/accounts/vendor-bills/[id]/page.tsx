"use client"

import * as React from 'react'
import { VendorBillPage } from '../../../../components/VendorBillPage'

export default function CcVendorBillPage({ params }: { params?: { id?: string } }) {
  return <VendorBillPage key={params?.id} billId={params?.id ?? ''} />
}
