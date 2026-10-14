"use client"

import * as React from 'react'
import { TcDetailPage } from '../../../../components/tc/TcPages'

export default function CcTestCertificatePage({ params }: { params?: { id?: string } }) {
  return <TcDetailPage key={params?.id} id={params?.id ?? ''} />
}
