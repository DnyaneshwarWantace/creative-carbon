"use client"

import * as React from 'react'
import { PurchaseOrderPage } from '../../../../components/PurchaseOrderPage'

export default function DermatPurchaseOrderPage({ params }: { params?: { id?: string } }) {
  return <PurchaseOrderPage key={params?.id} poId={params?.id ?? ''} />
}
