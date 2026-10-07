"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'

type FormDialogProps = {
  open: boolean
  title: string
  description?: string
  submitLabel: string
  busy?: boolean
  destructive?: boolean
  size?: 'md' | 'lg'
  onClose: () => void
  onSubmit: () => void
  children: React.ReactNode
}

export function FormDialog({ open, title, description, submitLabel, busy, destructive, size = 'md', onClose, onSubmit, children }: FormDialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent
        className={cn('max-h-screen overflow-y-auto', size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            if (!busy) onSubmit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onSubmit} disabled={busy}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
