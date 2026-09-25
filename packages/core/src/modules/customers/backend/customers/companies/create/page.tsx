"use client"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CreateCompanyPanel, type CreatedCompany } from '../../../../components/CreateCompanyPanel'

export default function CreateCompanyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/backend/customers/companies'

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.push(returnTo)
    }
  }

  const handleCreated = (company: CreatedCompany) => {
    if (returnTo && returnTo !== '/backend/customers/companies') {
      router.push(returnTo)
    } else if (company.id) {
      router.push(`/backend/customers/companies-v2/${company.id}`)
    } else {
      router.push('/backend/customers/companies')
    }
  }

  return (
    <Page>
      <PageBody>
        <CreateCompanyPanel
          open={true}
          onOpenChange={handleOpenChange}
          onCreated={handleCreated}
        />
      </PageBody>
    </Page>
  )
}
