"use client"

import * as React from 'react'
import { ChemicalRegisterPage } from '../../../components/resin/ChemicalRegisterPage'

export default function CcChemicalRegisterPage() {
  return (
    <React.Suspense fallback={null}>
      <ChemicalRegisterPage />
    </React.Suspense>
  )
}
