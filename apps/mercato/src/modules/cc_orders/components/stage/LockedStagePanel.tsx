"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { SharedStageFields, lockedStatusText } from '../LockedStageRow'
import type { Stage } from '../types'

export function LockedStagePanel({ stage }: { stage: Stage }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4 p-4">
      <Notice
        variant="info"
        title={t('cc_orders.locked.title', '{stage} is with {department}', { stage: stage.label, department: stage.department })}
        message={t('cc_orders.locked.message', 'You can see where it is and the details it shares with other departments. The rest stays with {department}.', { department: stage.department })}
      />
      <p className="text-sm">{lockedStatusText(stage, t)}</p>
      <SharedStageFields stage={stage} />
    </div>
  )
}
