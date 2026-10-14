"use client"

import * as React from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export type PartyKind = 'customer' | 'vendor'

const MAX_IMAGE_BYTES = 500_000

type LogoResponse = { imageUrl?: string | null; error?: string }

export function usePartyLogo(kind: PartyKind, partyId: string | null | undefined): string | null {
  const [logo, setLogo] = React.useState<string | null>(null)
  React.useEffect(() => {
    let alive = true
    setLogo(null)
    if (!partyId) return undefined
    void apiCall<LogoResponse>(`/api/cc_accounts/party-logo?kind=${kind}&id=${encodeURIComponent(partyId)}`).then((call) => {
      if (alive) setLogo(call.ok ? (call.result?.imageUrl ?? null) : null)
    })
    return () => {
      alive = false
    }
  }, [kind, partyId])
  return logo
}

export function PartyLogoPicker({ kind, partyId, canEdit = true }: { kind: PartyKind; partyId: string; canEdit?: boolean }) {
  const t = useT()
  const loaded = usePartyLogo(kind, partyId)
  const [override, setOverride] = React.useState<string | null | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { runMutation } = useGuardedMutation({ contextId: `cc-party-logo-${kind}` })
  const shown = override === undefined ? loaded : override

  const write = async (method: 'PUT' | 'DELETE', imageUrl?: string) => {
    setBusy(true)
    try {
      const url = method === 'PUT' ? '/api/cc_accounts/party-logo' : `/api/cc_accounts/party-logo?kind=${kind}&id=${encodeURIComponent(partyId)}`
      const body = method === 'PUT' ? { kind, id: partyId, imageUrl } : {}
      const call = await runMutation({
        context: { resourceKind: 'cc_accounts.party_logo', resourceId: partyId },
        mutationPayload: body,
        operation: () => apiCall<LogoResponse>(url, { method, headers: { 'content-type': 'application/json' }, body: method === 'PUT' ? JSON.stringify(body) : undefined }),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_ui.partyLogo.error', 'Could not save the logo.'), 'error')
        return
      }
      setOverride(method === 'PUT' ? (imageUrl ?? null) : null)
      flash(method === 'PUT' ? t('cc_ui.partyLogo.saved', 'Logo saved. It now prints on this party’s documents.') : t('cc_ui.partyLogo.removed', 'Logo removed.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      flash(t('cc_ui.partyLogo.type', 'Pick a PNG, JPG or WebP image.'), 'error')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      flash(t('cc_ui.partyLogo.size', 'The image must be under 500 KB.'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => void write('PUT', String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex items-center gap-3" data-testid="party-logo">
      <div className="flex h-16 w-28 items-center justify-center rounded-md border border-border bg-background p-2">
        {shown ? <img src={shown} alt={t('cc_ui.partyLogo.alt', 'Logo')} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{t('cc_ui.partyLogo.none', 'No logo yet')}</span>}
      </div>
      {canEdit ? (
        <div className="flex flex-col gap-1.5">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImageUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {shown ? t('cc_ui.partyLogo.replace', 'Replace logo') : t('cc_ui.partyLogo.upload', 'Upload logo')}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void write('DELETE')}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_ui.partyLogo.remove', 'Remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
