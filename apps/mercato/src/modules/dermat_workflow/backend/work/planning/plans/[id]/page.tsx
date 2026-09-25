"use client"

import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { MaterialPlanEditor } from '../../../../../components/MaterialPlanEditor'

export default function MaterialPlanPage({ params }: { params?: { id?: string } }) {
  return (
    <Page>
      <PageBody>
        <MaterialPlanEditor planId={params?.id ?? null} />
      </PageBody>
    </Page>
  )
}
