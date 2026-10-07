"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { ProductForm } from '../../../../components/ProductForm'
import { kindFromSlug } from '../../../../lib/kindConfig'

export default function NewCcProductPage({ params }: { params?: { slug?: string } }) {
  const t = useT()
  const kind = kindFromSlug(params?.slug)
  if (!kind) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={t('cc_products.errors.unknownType', 'Unknown product type.')} />
        </PageBody>
      </Page>
    )
  }
  return <ProductForm kind={kind} />
}
