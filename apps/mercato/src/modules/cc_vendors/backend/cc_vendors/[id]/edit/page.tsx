'use client'

import { VendorForm } from '../../../../components/VendorForm'

export default function EditVendorPage({ params }: { params?: { id?: string } }) {
  return <VendorForm key={params?.id} vendorId={params?.id} />
}
