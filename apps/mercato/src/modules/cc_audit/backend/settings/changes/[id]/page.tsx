"use client"

import * as React from 'react'
import { SettingsChangeDetail } from '../../../../components/SettingsChangePages'

export default function CcSettingsChangePage({ params }: { params?: { id?: string } }) {
  return <SettingsChangeDetail key={params?.id} changeId={params?.id ?? ''} />
}
