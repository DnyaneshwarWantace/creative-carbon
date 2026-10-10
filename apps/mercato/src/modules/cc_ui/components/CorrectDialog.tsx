"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Ban, RotateCcw } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'

export type CorrectionPreview = { undo: string[]; blockedBy: Array<{ label: string; href: string | null }> }

export const MIN_REASON = 3

export function CorrectDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  undo,
  loadPreview,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  undo?: string[]
  loadPreview?: () => Promise<CorrectionPreview | null>
  onConfirm: (reason: string) => Promise<boolean | void>
}) {
  const t = useT()
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [preview, setPreview] = React.useState<CorrectionPreview | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setReason('')
    setPreview(null)
    if (!loadPreview) return
    let cancelled = false
    setLoading(true)
    void loadPreview().then((result) => {
      if (cancelled) return
      setPreview(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, loadPreview])

  const blocked = Boolean(preview?.blockedBy.length)
  const ready = reason.trim().length >= MIN_REASON && !blocked && !busy && !loading
  const items = preview?.undo ?? undo ?? []

  const confirm = async () => {
    if (!ready) return
    setBusy(true)
    try {
      const ok = await onConfirm(reason.trim())
      if (ok !== false) onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void confirm()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive ? <Ban className="h-4 w-4 text-status-error-icon" aria-hidden="true" /> : <RotateCcw className="h-4 w-4 text-primary" aria-hidden="true" />}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : null}
        {blocked ? (
          <div className="space-y-1 rounded-md border border-status-error-border bg-status-error-bg p-3 text-sm text-status-error-text">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t('cc_ui.correct.blocked', 'This cannot be undone yet because of:')}
            </p>
            <ul className="list-disc pl-5">
              {preview!.blockedBy.map((entry) => (
                <li key={entry.label}>
                  {entry.href ? (
                    <Link className="underline" href={entry.href}>
                      {entry.label}
                    </Link>
                  ) : (
                    entry.label
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs">{t('cc_ui.correct.blockedHint', 'Undo those first, then come back here.')}</p>
          </div>
        ) : items.length ? (
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{t('cc_ui.correct.willUndo', 'This will:')}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {items.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="correct-reason">{t('cc_ui.correct.reason', 'Why? (kept in the history)')} *</Label>
          <Textarea id="correct-reason" rows={3} autoFocus value={reason} disabled={busy || blocked} onChange={(event) => setReason(event.target.value)} placeholder={t('cc_ui.correct.reasonHint', 'e.g. Wrong weight typed, 112.5 should be 121.5')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={!ready} onClick={() => void confirm()}>
            {busy ? t('cc_ui.correct.working', 'Working…') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CorrectDialog
