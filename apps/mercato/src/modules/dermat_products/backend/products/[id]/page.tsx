"use client"

import * as React from 'react'
import { EditProduct } from '../../../components/EditProduct'

export default function EditDermatProductPage({ params }: { params?: { id?: string } }) {
  return <EditProduct productId={params?.id ?? ''} />
}
