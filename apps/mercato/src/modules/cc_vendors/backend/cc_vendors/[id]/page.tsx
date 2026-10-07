"use client"

import * as React from 'react'
import { VendorFile } from '../../../../cc_purchase/components/VendorFile'

export default function CcVendorPage({ params }: { params?: { id?: string } }) {
  return <VendorFile key={params?.id} vendorId={params?.id ?? ''} />
}
