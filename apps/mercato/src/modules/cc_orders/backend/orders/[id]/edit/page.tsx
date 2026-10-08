"use client"

import * as React from 'react'
import { CcOrderForm as OrderForm } from '../../../../components/CcOrderForm'

export default function EditCcOrderPage({ params }: { params?: { id?: string } }) {
  return <OrderForm key={params?.id} orderId={params?.id ?? ''} />
}
