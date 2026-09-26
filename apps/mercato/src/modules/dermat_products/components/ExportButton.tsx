"use client"

import * as React from 'react'
import { Download } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type Props = {
  onExport: () => void | Promise<void>
  label?: string
  disabled?: boolean
  size?: 'sm' | 'default'
}

export function ExportButton({ onExport, label, disabled, size = 'default' }: Props) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await onExport()
    } catch {
      flash(t('dermat_products.export.failed', 'Could not export. Try again.'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" size={size} onClick={() => void run()} disabled={disabled || busy}>
      {busy ? <Spinner size="sm" className="mr-2" /> : <Download className="mr-2 h-4 w-4" />}
      {label ?? t('dermat_products.export.label', 'Export to Excel')}
    </Button>
  )
}

export default ExportButton
