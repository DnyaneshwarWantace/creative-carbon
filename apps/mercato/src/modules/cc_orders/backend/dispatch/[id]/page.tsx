"use client"

import * as React from 'react'
import { DespatchPage } from '../../../components/DespatchPage'

export default function CcDespatchPage({ params }: { params?: { id?: string } }) {
  return <DespatchPage key={params?.id} id={params?.id ?? ''} />
}
