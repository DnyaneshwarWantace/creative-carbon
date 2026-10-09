"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DropdownManager } from '../../../../cc_lists/components/DropdownManager'
import { CRM_LIST_KEYS } from '../../../../cc_lists/lib/lists'

export default function CcCrmListsPage() {
  const t = useT()
  return (
    <DropdownManager
      only={CRM_LIST_KEYS}
      title={t('cc_crm.lists.title', 'CRM dropdown lists')}
      lede={t('cc_crm.lists.lede', 'Choices used on enquiries, quotations and orders: enquiry sources, lost reasons, incoterms, currencies, ports, payment remarks and item forms. Changes apply everywhere straight away.')}
    />
  )
}
