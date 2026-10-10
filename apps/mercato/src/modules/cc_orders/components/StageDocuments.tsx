"use client"

import * as React from 'react'
import { CheckCircle2, CircleAlert, FileText } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Attachments } from '../../cc_ui/components/Attachments'
import { EWAY_BILL_LIMIT, documentRecordId, stageDef } from '../lib/stages'
import type { StageDocumentStatus } from './types'

const ENTITY = 'cc_orders:order_stage'

export function StageDocuments({ orderId, stageKey, documents, editable }: { orderId: string; stageKey: string; documents: StageDocumentStatus[]; editable: boolean }) {
  const t = useT()
  const [counts, setCounts] = React.useState<Record<string, number>>(() => Object.fromEntries(documents.map((doc) => [doc.key, doc.count])))

  React.useEffect(() => {
    setCounts(Object.fromEntries(documents.map((doc) => [doc.key, doc.count])))
  }, [documents])

  const recount = async (key: string) => {
    const query = new URLSearchParams({ type: 'order', id: orderId, entityId: ENTITY, recordId: documentRecordId(orderId, stageKey, key) })
    const call = await apiCall<{ items?: unknown[] }>(`/api/cc_audit/files?${query.toString()}`, undefined, { fallback: { items: [] } })
    setCounts((prev) => ({ ...prev, [key]: call.result?.items?.length ?? 0 }))
  }

  const stageLabel = stageDef(stageKey)?.label ?? stageKey
  const needed = documents.filter((doc) => doc.needed)
  const missing = needed.filter((doc) => !counts[doc.key])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('cc_orders.docs.title', 'Documents and photos')}
        </p>
        {needed.length ? (
          missing.length ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning-text">
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {t('cc_orders.docs.missing', '{count} required still missing', { count: missing.length })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success-text">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('cc_orders.docs.complete', 'Required documents uploaded')}
            </span>
          )
        ) : null}
      </div>
      {documents.map((doc) => {
        const count = counts[doc.key] ?? 0
        const requirement = doc.required === 'always'
          ? t('cc_orders.docs.required', 'Required to complete')
          : doc.required === 'eway'
            ? doc.needed
              ? t('cc_orders.docs.ewayNeeded', 'Required: order is above ₹{limit}', { limit: EWAY_BILL_LIMIT.toLocaleString('en-IN') })
              : t('cc_orders.docs.ewayNotNeeded', 'Not needed: order is below ₹{limit}', { limit: EWAY_BILL_LIMIT.toLocaleString('en-IN') })
            : t('cc_orders.docs.optional', 'Optional')
        return (
          <div key={doc.key} className={cn('rounded-md border p-3', doc.needed && !count && 'border-status-warning-border')}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{doc.label}</p>
                <p className="text-xs text-muted-foreground">{doc.hint}</p>
              </div>
              <span className={cn('shrink-0 rounded-sm px-1.5 py-0.5 text-xs', count ? 'bg-status-success-bg text-status-success-text' : doc.needed ? 'bg-status-warning-bg text-status-warning-text' : 'bg-muted text-muted-foreground')}>
                {count ? t('cc_orders.docs.files', '{count} file(s)', { count }) : requirement}
              </span>
            </div>
            {editable || count ? (
              <Attachments type="order" id={orderId} bare slot={{ entityId: ENTITY, recordId: documentRecordId(orderId, stageKey, doc.key) }} label={`${stageLabel}: ${doc.label}`} onChanged={() => void recount(doc.key)} />
            ) : null}
          </div>
        )
      })}
      <Attachments
        type="order"
        id={orderId}
        slot={{ entityId: ENTITY, recordId: `${orderId}:${stageKey}` }}
        title={t('cc_orders.docs.other', 'Other documents')}
        hint={t('cc_orders.sheet.documentsHint', 'Attach sheets, photos, COA, approvals or anything else for this stage.')}
      />
    </div>
  )
}

export default StageDocuments
