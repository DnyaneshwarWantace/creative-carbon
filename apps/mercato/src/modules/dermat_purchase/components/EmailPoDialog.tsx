"use client"

import * as React from 'react'
import { Mail } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { PoView } from './shared'

function emails(text: string): string[] {
  return text.split(/[,;\s]+/).map((entry) => entry.trim()).filter(Boolean)
}

export function EmailPoButton({ po, onSent }: { po: PoView; onSent: () => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-po-email-${po.id}` })
  const [open, setOpen] = React.useState(false)
  const [configured, setConfigured] = React.useState<boolean | null>(null)
  const [to, setTo] = React.useState(po.vendorEmail ?? '')
  const [cc, setCc] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const lastSent = [...(po.history ?? [])].reverse().find((entry) => entry.action === 'emailed')

  React.useEffect(() => {
    if (!open) return
    setTo(po.vendorEmail ?? '')
    setMessage(t('dermat_purchase.email.defaultMessage', 'Dear {name},\nPlease find our purchase order {code} below. Kindly confirm the delivery date and send the COA with every batch.', { name: po.vendorContact || po.vendorName, code: po.code }))
    void apiCall<{ configured?: boolean }>('/api/dermat_purchase/orders/email', undefined, { fallback: { configured: false } }).then((call) => setConfigured(Boolean(call.result?.configured)))
  }, [open, po, t])

  const send = async () => {
    const toList = emails(to)
    if (!toList.length) {
      flash(t('dermat_purchase.email.needTo', 'Enter the vendor email.'), 'error')
      return
    }
    const body = { id: po.id, to: toList, cc: emails(cc), message: message.trim() || null }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'dermat_purchase.order', resourceId: po.id },
        mutationPayload: body,
        operation: () => apiCall<{ error?: string }>('/api/dermat_purchase/orders/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_purchase.email.error', 'Could not send the email.'), 'error')
        return
      }
      flash(t('dermat_purchase.email.sent', '{code} emailed to {to}.', { code: po.code, to: toList.join(', ') }), 'success')
      setOpen(false)
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} title={lastSent ? t('dermat_purchase.email.lastSent', 'Last emailed {when}', { when: new Date(lastSent.at).toLocaleString('en-IN') }) : undefined}>
        <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {lastSent ? t('dermat_purchase.email.again', 'Email again') : t('dermat_purchase.email.button', 'Email vendor')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('dermat_purchase.email.title', 'Email {code} to the vendor', { code: po.code })}</DialogTitle>
            <DialogDescription>{t('dermat_purchase.email.description', 'The PO with all lines, rates and totals goes in the email body. Replies come to the company email.')}</DialogDescription>
          </DialogHeader>
          {configured === false ? (
            <Alert status="warning" style="lighter">
              <AlertDescription>{t('dermat_purchase.email.notConfigured', 'Email sending is not set up on the server yet (RESEND_API_KEY and EMAIL_FROM). Use Print PO or WhatsApp until then.')}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-email-to">{t('dermat_purchase.email.to', 'To')}</Label>
              <Input id="po-email-to" value={to} onChange={(event) => setTo(event.target.value)} placeholder="sales@vendor.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-email-cc">{t('dermat_purchase.email.cc', 'Copy to (optional)')}</Label>
              <Input id="po-email-cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="store@dermatindia.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-email-message">{t('dermat_purchase.email.message', 'Message')}</Label>
              <Textarea id="po-email-message" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => void send()} disabled={busy || configured === false}>
              <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {busy ? t('dermat_purchase.email.sending', 'Sending…') : t('dermat_purchase.email.send', 'Send email')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
