"use client"

import * as React from 'react'
import { CustomerForm } from '../../../../components/CustomerForm'

export default function CcCustomerEditPage({ params }: { params?: { id?: string } }) {
  return <CustomerForm key={params?.id} customerId={params?.id ?? ''} />
}
