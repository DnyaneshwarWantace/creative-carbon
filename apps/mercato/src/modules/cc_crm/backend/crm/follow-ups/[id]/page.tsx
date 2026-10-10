"use client"

import * as React from 'react'
import { FollowUpPage } from '../../../../components/FollowUpPages'

export default function CcFollowUpPage({ params }: { params?: { id?: string } }) {
  return <FollowUpPage key={params?.id} id={params?.id ?? ''} />
}
