"use client"

import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { MaterialPlanEditor } from '../../../../../components/MaterialPlanEditor'

export default function CreateMaterialPlanPage() {
  return (
    <Page>
      <PageBody>
        <MaterialPlanEditor />
      </PageBody>
    </Page>
  )
}
