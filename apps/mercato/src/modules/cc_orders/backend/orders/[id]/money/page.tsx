"use client"

import * as React from 'react'
import { OrderAccountPage } from '../../../../components/OrderAccountPage'

export default function CcOrderAccountPage({ params }: { params?: { id?: string } }) {
  return <OrderAccountPage key={params?.id} orderId={params?.id ?? ''} />
}
