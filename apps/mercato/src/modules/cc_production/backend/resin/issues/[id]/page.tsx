"use client"

import * as React from 'react'
import { ChemicalIssuePage } from '../../../../components/resin/ChemicalIssuePage'

export default function CcChemicalIssuePage({ params }: { params?: { id?: string } }) {
  return <ChemicalIssuePage key={params?.id} issueId={params?.id ?? ''} />
}
