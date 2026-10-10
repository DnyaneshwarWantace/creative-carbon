"use client"

import * as React from 'react'
import { SalesPersonPage } from '../../../../components/SalesPersonPage'

export default function CcSalesPersonPage({ params }: { params?: { id?: string } }) {
  return <SalesPersonPage key={params?.id} id={params?.id ?? ''} />
}
