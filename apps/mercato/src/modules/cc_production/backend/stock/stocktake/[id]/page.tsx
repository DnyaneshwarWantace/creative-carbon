"use client"

import * as React from 'react'
import { StocktakeRecordPage } from '../../../../components/owner/StoreRecords'

export default function CcStocktakeRecordPage({ params }: { params?: { id?: string } }) {
  return <StocktakeRecordPage key={params?.id} id={params?.id ?? ''} />
}
