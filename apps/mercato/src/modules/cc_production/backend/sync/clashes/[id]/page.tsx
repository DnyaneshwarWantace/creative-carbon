"use client"

import * as React from 'react'
import { ClashDetailPage } from '../../../../components/owner/ClashPages'

export default function CcClashDetailPage({ params }: { params?: { id?: string } }) {
  return <ClashDetailPage key={params?.id} clashId={params?.id ?? ''} />
}
