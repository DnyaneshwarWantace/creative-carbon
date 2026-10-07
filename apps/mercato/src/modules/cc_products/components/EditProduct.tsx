"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { PRODUCT_KINDS, type ProductKind } from '../lib/kinds'
import { ProductForm } from './ProductForm'

function isKind(value: unknown): value is ProductKind {
  return PRODUCT_KINDS.some((entry) => entry.code === value)
}

export function EditProduct({ productId }: { productId: string }) {
  const t = useT()
  const [kind, setKind] = React.useState<ProductKind | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    apiCall<{ items?: Array<Record<string, unknown>> }>(
      `/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`,
    ).then((call) => {
      if (cancelled) return
      const product = call.result?.items?.[0]
      const code = product?.custom_fieldset_code ?? product?.customFieldsetCode
      if (!call.ok || !product) setError(t('cc_products.errors.notFound', 'Product not found.'))
      else setKind(isKind(code) ? code : 'chemical')
    })
    return () => {
      cancelled = true
    }
  }, [productId, t])

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }
  if (!kind) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_products.form.loading', 'Loading…')} />
        </PageBody>
      </Page>
    )
  }
  return <ProductForm kind={kind} productId={productId} />
}

export default EditProduct
