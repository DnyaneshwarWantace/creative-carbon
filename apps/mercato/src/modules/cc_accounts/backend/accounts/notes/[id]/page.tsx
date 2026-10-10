"use client"

import * as React from 'react'
import { NotePage } from '../../../../components/NotePage'

export default function CcNotePage({ params }: { params?: { id?: string } }) {
  return <NotePage key={params?.id} id={params?.id ?? ''} />
}
