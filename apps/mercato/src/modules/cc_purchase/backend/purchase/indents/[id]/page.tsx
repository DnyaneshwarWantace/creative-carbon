"use client"

import * as React from 'react'
import { IndentPage } from '../../../../components/IndentPage'

export default function CcIndentPage({ params }: { params?: { id?: string } }) {
  return <IndentPage key={params?.id} indentId={params?.id ?? ''} />
}
