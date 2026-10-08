"use client"

import * as React from 'react'
import { UploadDetail } from '../../../../components/UploadCentre'

export default function CcUploadDetailPage({ params }: { params?: { id?: string } }) {
  return <UploadDetail key={params?.id} uploadId={params?.id ?? ''} />
}
