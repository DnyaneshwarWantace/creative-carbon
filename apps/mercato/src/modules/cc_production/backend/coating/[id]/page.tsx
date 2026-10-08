"use client"

import * as React from 'react'
import { CoatingSheetPage } from '../../../components/coating/CoatingSheetPage'

export default function CcCoatingSheetPage({ params }: { params?: { id?: string } }) {
  return <CoatingSheetPage key={params?.id} sheetId={params?.id ?? ''} />
}
