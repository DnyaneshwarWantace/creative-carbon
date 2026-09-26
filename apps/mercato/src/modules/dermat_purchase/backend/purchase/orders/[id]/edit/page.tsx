"use client"

import * as React from 'react'
import { PurchaseOrderForm } from '../../../../../components/PurchaseOrderForm'

export default function DermatEditPurchaseOrderPage({ params }: { params?: { id?: string } }) {
  return <PurchaseOrderForm key={params?.id} poId={params?.id} />
}
