"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { WorkQueue } from '../../../components/WorkQueue'

export default function AccountsWorkQueuePage() {
  const t = useT()
  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{t('dermat_workflow.queue.accounts.title', 'Accounts — Work Queue')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dermat_workflow.queue.subtitle', 'Everything waiting at your department. Open a row, fill in the stage details and complete it to send the work to the next department.')}
          </p>
        </div>
        <WorkQueue department="accounts" />
      </PageBody>
    </Page>
  )
}
