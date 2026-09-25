"use client"

import * as React from 'react'
import { ProductDetail } from '../../../components/ProductDetail'

export default function DermatProductDetailPage({ params }: { params?: { id?: string } }) {
  return <ProductDetail key={params?.id} productId={params?.id ?? ''} />
}
