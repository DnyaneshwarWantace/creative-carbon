"use client"

import * as React from 'react'
import { VendorFile } from '../../../../dermat_purchase/components/VendorFile'

export default function DermatVendorPage({ params }: { params?: { id?: string } }) {
  return <VendorFile key={params?.id} vendorId={params?.id ?? ''} />
}
