"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { MASTER_DEFS } from '../../../lib/masterDefs'
import { MasterTable } from '../../../components/MasterGrid'
import { DieFinder } from '../../../components/DieFinder'

export default function DieChartPage() {
  const t = useT()
  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <h1 className="text-xl font-semibold">{t('cc_production.nav.chart', 'Die chart')}</h1>
          <DieFinder />
          <MasterTable def={MASTER_DEFS.chart} />
        </div>
      </PageBody>
    </Page>
  )
}
