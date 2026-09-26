"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RdRequestsPage } from '../../../components/RdRequestsPage'

export default function DermatSalesSamplesPage() {
  const t = useT()
  return <RdRequestsPage defaultView="samples" title={t('dermat_rnd.salesTitle', 'R&D requests & samples')} />
}
