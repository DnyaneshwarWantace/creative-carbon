"use client"

import * as React from 'react'
import { Pencil, Save, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type Props = {
  editing: boolean
  dirtyCount: number
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}

export function EditTableBar({ editing, dirtyCount, saving, onEdit, onCancel, onSave }: Props) {
  const t = useT()
  if (!editing) {
    return (
      <Button type="button" variant="outline" onClick={onEdit}>
        <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('cc_products.editTable.edit', 'Edit table')}
      </Button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-status-warning-bg px-2.5 py-1 text-xs font-semibold text-status-warning-text tabular-nums">
        {dirtyCount ? t('cc_products.editTable.changed', '{count} changed', { count: dirtyCount }) : t('cc_products.editTable.editing', 'Editing')}
      </span>
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
        <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('cc_products.editTable.cancel', 'Cancel')}
      </Button>
      <Button type="button" onClick={onSave} disabled={saving || dirtyCount === 0}>
        {saving ? <Spinner size="sm" className="mr-1.5" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
        {saving ? t('cc_products.editTable.saving', 'Saving…') : t('cc_products.editTable.save', 'Save all')}
      </Button>
    </span>
  )
}

export default EditTableBar
