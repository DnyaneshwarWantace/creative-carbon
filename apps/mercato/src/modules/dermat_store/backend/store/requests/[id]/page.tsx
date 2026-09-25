"use client"

import * as React from 'react'
import { StoreRequestPage } from '../../../../components/StoreRequestPage'

export default function DermatStoreRequestPage({ params }: { params?: { id?: string } }) {
  return <StoreRequestPage key={params?.id} requestId={params?.id ?? ''} />
}
