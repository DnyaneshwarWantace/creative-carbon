"use client"

import * as React from 'react'
import { ProductsPage } from '../../components/ProductsPage'
import { FINISHED_GOODS_KINDS } from '../../lib/kinds'

export default function CcFinishedGoodsPage() {
  return (
    <React.Suspense fallback={null}>
      <ProductsPage kinds={FINISHED_GOODS_KINDS} basePath="/backend/finished-goods" />
    </React.Suspense>
  )
}
