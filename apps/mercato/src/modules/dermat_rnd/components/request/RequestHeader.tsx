"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, FlaskConical, MessageSquare, Pencil, Play, Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { REQUEST_STATUS, dayText } from '../labels'
import type { RdRequest } from '../types'
import type { RequestActionKind } from './RequestActionDialog'

type RequestHeaderProps = {
  request: RdRequest
  canRequest: boolean
  canManage: boolean
  busy: boolean
  backHref: string
  onEdit: () => void
  onStart: () => void
  onNewTrial: () => void
  onAction: (action: RequestActionKind) => void
  onReopen: () => void
}

export function RequestHeader({ request, canRequest, canManage, busy, backHref, onEdit, onStart, onNewTrial, onAction, onReopen }: RequestHeaderProps) {
  const t = useT()
  const status = REQUEST_STATUS[request.status]
  const open = ['requested', 'in_progress', 'changes'].includes(request.status)
  const facts = [
    request.customerName ?? (request.kind === 'npd' ? t('dermat_rnd.npdLong', 'New product of our own') : null),
    request.assignedName ? t('dermat_rnd.with', 'with {name}', { name: request.assignedName }) : null,
    request.dueDate ? t('dermat_rnd.due', 'sample due {date}', { date: dayText(request.dueDate) }) : null,
    t('dermat_rnd.raisedOn', 'raised {date} by {name}', { date: dayText(request.createdAt), name: request.requestedByName ?? '—' }),
  ].filter(Boolean)

  return (
    <header className="flex flex-col gap-3 border-b pb-4">
      <Link href={backHref} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t('dermat_rnd.back', 'All R&D requests')}
      </Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-muted-foreground">{request.code}</span>
            <StatusBadge variant={status.variant}>{t(status.key, status.fallback)}</StatusBadge>
            {request.kind === 'npd' ? <StatusBadge variant="neutral">{t('dermat_rnd.npd', 'New product')}</StatusBadge> : null}
            {request.orderId ? (
              <Link href={`/backend/orders/${request.orderId}`} className="font-mono text-xs text-primary hover:underline">
                {request.orderNo}
              </Link>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{[request.productName, request.brand].filter(Boolean).join(' · ')}</h1>
          <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRequest && request.status !== 'dropped' ? (
            <Button type="button" variant="outline" onClick={onEdit} disabled={busy}>
              <Pencil className="mr-1.5 size-4" aria-hidden="true" />
              {t('dermat_rnd.edit', 'Edit request')}
            </Button>
          ) : null}
          {canManage && (request.status === 'requested' || request.status === 'changes') ? (
            <Button type="button" variant="outline" onClick={onStart} disabled={busy}>
              <Play className="mr-1.5 size-4" aria-hidden="true" />
              {t('dermat_rnd.start', 'Start work')}
            </Button>
          ) : null}
          {canManage && (open || request.status === 'sample_sent') ? (
            <Button type="button" variant="outline" onClick={onNewTrial} disabled={busy}>
              <FlaskConical className="mr-1.5 size-4" aria-hidden="true" />
              {t('dermat_rnd.newTrial', 'New trial')}
            </Button>
          ) : null}
          {canManage && open ? (
            <Button type="button" onClick={() => onAction('sample_sent')} disabled={busy}>
              <Send className="mr-1.5 size-4" aria-hidden="true" />
              {t('dermat_rnd.sent', 'Sample sent')}
            </Button>
          ) : null}
          {canRequest && request.status === 'sample_sent' ? (
            <Button type="button" onClick={() => onAction('feedback')} disabled={busy}>
              <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />
              {t('dermat_rnd.feedback', 'Client feedback')}
            </Button>
          ) : null}
          {canManage && request.status !== 'approved' && request.status !== 'dropped' ? (
            <Button type="button" variant="ghost" onClick={() => onAction('drop')} disabled={busy}>
              {t('dermat_rnd.drop', 'Drop')}
            </Button>
          ) : null}
          {canManage && request.status === 'dropped' ? (
            <Button type="button" variant="outline" onClick={onReopen} disabled={busy}>
              {t('dermat_rnd.reopen', 'Reopen')}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
