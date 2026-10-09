"use client"

import * as React from 'react'
import { TallyPushPage } from '../../../../components/TallyPushPage'

export default function CcTallyPushPage({ params }: { params?: { id?: string } }) {
  return <TallyPushPage key={params?.id} pushId={params?.id ?? ''} />
}
