"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ChainStrip, type ChainStep } from './RecordPage'

export type ChainKey = 'resin' | 'coating' | 'press' | 'moulding' | 'cutting' | 'thickness' | 'fg' | 'despatch'

const ROUTES: Record<'laminate' | 'moulded', ChainKey[]> = {
  laminate: ['resin', 'coating', 'press', 'cutting', 'thickness', 'fg', 'despatch'],
  moulded: ['resin', 'coating', 'moulding', 'cutting', 'fg', 'despatch'],
}

export function PlantChain({ current, route = 'laminate', hrefs = {} }: { current: ChainKey; route?: 'laminate' | 'moulded'; hrefs?: Partial<Record<ChainKey, string | null>> }) {
  const t = useT()
  const labels: Record<ChainKey, string> = {
    resin: t('cc_ui.chainStep.resin', 'Resin'),
    coating: t('cc_ui.chainStep.coating', 'Coating · B-stage'),
    press: t('cc_ui.chainStep.press', 'Press'),
    moulding: t('cc_ui.chainStep.moulding', 'Moulding'),
    cutting: t('cc_ui.chainStep.cutting', 'Cutting'),
    thickness: t('cc_ui.chainStep.thickness', 'Thickness'),
    fg: t('cc_ui.chainStep.fg', 'FG inspection'),
    despatch: t('cc_ui.chainStep.despatch', 'Order · despatch'),
  }
  const keys = ROUTES[route]
  const at = keys.indexOf(current)
  const steps: ChainStep[] = keys.map((key, index) => ({
    key,
    label: labels[key],
    href: hrefs[key] ?? null,
    state: index < at ? 'done' : index === at ? 'current' : 'next',
  }))
  return <ChainStrip steps={steps} />
}

export default PlantChain
