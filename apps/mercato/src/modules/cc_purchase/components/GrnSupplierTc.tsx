"use client"

import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Panel } from '../../cc_ui/components/RecordPage'
import type { GrnView } from './shared'

export function GrnSupplierTc({ grn, canEdit, onChanged }: { grn: GrnView; canEdit: boolean; onChanged: (next: GrnView) => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-grn-supplier-tc' })
  const [tcNo, setTcNo] = React.useState(grn.supplierTc?.tcNo ?? '')
  const [waived, setWaived] = React.useState(grn.supplierTc?.waivedReason ?? '')
  const [busy, setBusy] = React.useState(false)
  const info = grn.supplierTc
  if (!info || (!info.required && !info.tcNo && !info.waivedReason)) return null
  const satisfied = Boolean(info.tcNo || info.waivedReason)

  const save = async () => {
    const body = { id: grn.id, tcNo: tcNo.trim() || null, waivedReason: tcNo.trim() ? null : waived.trim() || null }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'cc_purchase.grn', resourceId: grn.id },
        mutationPayload: body,
        operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(grn.updatedAt), () => apiCall<GrnView & { error?: string }>('/api/cc_purchase/grns/supplier-tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_purchase.grnTc.error', 'Could not save.'), 'error')
        return
      }
      onChanged(call.result)
      flash(t('cc_purchase.grnTc.saved', 'Saved.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={t('cc_purchase.grnTc.title', 'Supplier test certificate')} icon={ShieldCheck} action={<StatusBadge variant={satisfied ? 'success' : 'warning'}>{satisfied ? t('cc_purchase.grnTc.ok', 'Recorded') : t('cc_purchase.grnTc.needed', 'Asked for on the PO')}</StatusBadge>}>
      <div className="space-y-3" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save() }}>
        <p className="text-sm text-muted-foreground">{t('cc_purchase.grnTc.hint', 'The PO asks for a test certificate with the delivery. Batches cannot be passed until its number is here, or a reason it is not needed.')}</p>
        <div className="space-y-1.5">
          <Label htmlFor="grn-tc-no">{t('cc_purchase.grnTc.no', 'Certificate number')}</Label>
          <Input id="grn-tc-no" disabled={!canEdit} value={tcNo} onChange={(event) => setTcNo(event.target.value)} />
        </div>
        {!tcNo.trim() ? (
          <div className="space-y-1.5">
            <Label htmlFor="grn-tc-why">{t('cc_purchase.grnTc.waived', 'Or why it is not needed')}</Label>
            <Input id="grn-tc-why" disabled={!canEdit} value={waived} onChange={(event) => setWaived(event.target.value)} />
          </div>
        ) : null}
        {canEdit ? <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>{t('cc_purchase.grnTc.save', 'Save')}</Button> : null}
      </div>
    </Panel>
  )
}
