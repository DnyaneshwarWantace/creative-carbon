"use client"

import * as React from 'react'
import { QcCheckPage } from '../../../../components/QcCheckPage'

export default function DermatQcCheckPage({ params }: { params?: { id?: string } }) {
  return <QcCheckPage key={params?.id} checkId={params?.id ?? ''} />
}
