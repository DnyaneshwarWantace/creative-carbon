"use client"

import * as React from 'react'
import { OrdersPage } from '../../components/OrdersPage'

export default function DermatOrdersPage() {
  return (
    <React.Suspense fallback={null}>
      <OrdersPage />
    </React.Suspense>
  )
}
