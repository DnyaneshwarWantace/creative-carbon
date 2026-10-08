"use client"

import * as React from 'react'
import { EnquiryEdit } from '../../../../../components/EnquiryPage'

export default function CcEditEnquiryPage({ params }: { params?: { id?: string } }) {
  return <EnquiryEdit key={params?.id} enquiryId={params?.id ?? ''} />
}
