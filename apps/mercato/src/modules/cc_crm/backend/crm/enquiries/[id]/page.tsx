"use client"

import * as React from 'react'
import { EnquiryPage } from '../../../../components/EnquiryPage'

export default function CcEnquiryPage({ params }: { params?: { id?: string } }) {
  return <EnquiryPage key={params?.id} enquiryId={params?.id ?? ''} />
}
