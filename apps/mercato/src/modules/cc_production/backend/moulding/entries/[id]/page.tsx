"use client"

import * as React from 'react'
import { MouldingEntryPage } from '../../../../components/moulding/MouldingExtras'

export default function CcMouldingEntryPage({ params }: { params?: { id?: string } }) {
  return <MouldingEntryPage key={params?.id} entryId={params?.id ?? ''} />
}
