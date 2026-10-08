"use client"

import * as React from 'react'
import { BstageLotPage } from '../../../../components/coating/BstageLotPage'

export default function CcBstageLotPage({ params }: { params?: { id?: string } }) {
  return <BstageLotPage key={params?.id} lotId={params?.id ?? ''} />
}
