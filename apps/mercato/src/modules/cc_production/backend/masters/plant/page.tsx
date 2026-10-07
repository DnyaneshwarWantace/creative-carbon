"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MasterGridPage } from '../../../components/MasterGrid'

export default function PlantMachinesPage() {
  const t = useT()
  return <MasterGridPage title={t('cc_production.nav.plant', 'Plant machines')} types={['reactors', 'dryers', 'presses']} />
}
