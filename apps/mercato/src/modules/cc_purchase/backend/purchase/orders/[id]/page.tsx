"use client"

import * as React from 'react'
import { PurchaseOrderPage } from '../../../../components/PurchaseOrderPage'

export default function CcPurchaseOrderPage({ params }: { params?: { id?: string } }) {
  return <PurchaseOrderPage key={params?.id} poId={params?.id ?? ''} />
}
