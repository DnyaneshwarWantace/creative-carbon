"use client"

import { JobWorkDetailPage } from '../../../../components/JobWorkPages'

export default function CcJobWorkDetailPage({ params }: { params?: { id?: string } }) {
  return <JobWorkDetailPage key={params?.id} id={params?.id ?? ''} />
}
