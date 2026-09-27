"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StockPage } from '../../../components/StockPage'

export default function DermatPMStockPage() {
  const t = useT()
  return <StockPage fixedPlace="pm" title={t('dermat_store.nav.pmStock', 'PM store stock')} />
}
