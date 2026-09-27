"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StockPage } from '../../../components/StockPage'

export default function DermatRMStockPage() {
  const t = useT()
  return <StockPage fixedPlace="rm" title={t('dermat_store.nav.rmStock', 'RM store stock')} />
}
