"use client"

import * as React from 'react'
import { OrderForm } from '../../../../components/OrderForm'

export default function EditCcOrderPage({ params }: { params?: { id?: string } }) {
  return <OrderForm key={params?.id} orderId={params?.id ?? ''} />
}
