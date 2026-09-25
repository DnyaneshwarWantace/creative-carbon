"use client"

import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MaterialRequests } from '../../../../components/MaterialRequests'

export default function MaterialRequestsPage() {
  const t = useT()
  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{t('dermat_workflow.requests.pageTitle', 'Material Requests')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dermat_workflow.requests.pageSubtitle', 'Requests sent by Planning: what each plan needs from the store and what the store has. Open one and issue the material — stock is deducted when you issue.')}
          </p>
        </div>
        <MaterialRequests />
      </PageBody>
    </Page>
  )
}
