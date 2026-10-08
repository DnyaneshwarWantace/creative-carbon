"use client"

import * as React from 'react'
import { StockLotPage } from '../../../../components/owner/OwnerPages'

export default function CcStockLotRoute({ params }: { params?: { id?: string } }) {
  return <StockLotPage key={params?.id} lotId={params?.id ?? ''} />
}
