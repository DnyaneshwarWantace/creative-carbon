"use client"

import * as React from 'react'
import { QcRulePage } from '../../../../components/QcRulePage'

export default function DermatQcRuleEditPage({ params }: { params?: { id?: string } }) {
  return <QcRulePage key={params?.id} ruleId={params?.id} />
}
