"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MasterGridPage } from '../../../components/MasterGrid'

export default function TolerancePage() {
  const t = useT()
  return <MasterGridPage title={t('cc_production.nav.tolerance', 'Loading tolerance')} types={['tolerances']} />
}
