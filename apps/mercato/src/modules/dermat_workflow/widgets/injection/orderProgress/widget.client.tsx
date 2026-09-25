"use client"

import * as React from 'react'
import { OrderFlowPanel } from '../../../components/OrderFlowPanel'

type OrderProgressContext = {
  orderId?: string
  onChanged?: () => void
}

export default function OrderProgressWidget({ context }: { context?: OrderProgressContext }) {
  const orderId = context?.orderId
  if (!orderId) return null
  return <OrderFlowPanel orderId={orderId} onChanged={context?.onChanged} />
}
