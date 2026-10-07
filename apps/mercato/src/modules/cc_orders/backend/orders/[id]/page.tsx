"use client"

import * as React from 'react'
import { OrderView } from '../../../components/OrderView'

export default function CcOrderPage({ params }: { params?: { id?: string } }) {
  return <OrderView key={params?.id} orderId={params?.id ?? ''} />
}
