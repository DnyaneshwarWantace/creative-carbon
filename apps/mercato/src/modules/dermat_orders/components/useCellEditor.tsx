"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { InlineCell } from '../../dermat_products/components/InlineCell'
import type { CellEdit, CellInput, SheetColumn, SheetOrder } from './orderBookColumns'

type Options = {
  contextId: string
  patchOrder: (orderId: string, mutate: (order: SheetOrder) => SheetOrder) => void
  refresh: () => void
}

export function useCellEditor({ contextId, patchOrder, refresh }: Options) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId })

  const saveCell = async (edit: CellEdit, input: CellInput, raw: string): Promise<boolean> => {
    const { order, line } = input
    const value: string | number | null = edit.kind === 'number' ? (raw.trim() === '' ? null : Number(raw)) : raw
    if (edit.kind === 'number' && value !== null && !Number.isFinite(value)) {
      flash(t('dermat_orders.book.notNumber', 'Enter a number'), 'error')
      return false
    }
    const body =
      edit.target === 'stage'
        ? { orderId: order.id, stageKey: edit.stageKey, action: 'save', data: { [edit.field]: value } }
        : { orderId: order.id, target: edit.target, lineId: line?.id, section: edit.section, field: edit.field, value }
    const url = edit.target === 'stage' ? '/api/dermat_orders/orders/stage' : '/api/dermat_orders/orders/cell'
    const call = await runMutation({
      context: { orderId: order.id, field: edit.field },
      mutationPayload: body,
      operation: () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(order.updatedAt), () =>
          apiCall<{ updatedAt?: string; error?: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ),
    })
    if (!call.ok) {
      flash(
        call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
          ? t('dermat_orders.errors.conflict', 'Someone else changed this order. Reload to see the latest.')
          : (call.result?.error ?? t('dermat_orders.book.cellError', 'Could not save the change.')),
        'error',
      )
      if (call.status === 409) {
        refresh()
      }
      return false
    }
    const updatedAt = call.result?.updatedAt ?? order.updatedAt
    patchOrder(order.id, (current) => {
      const next: SheetOrder = { ...current, updatedAt }
      if (edit.target === 'order') return { ...next, [edit.field]: value } as SheetOrder
      if (edit.target === 'stage' && edit.stageKey) {
        const stage = current.stages[edit.stageKey]
        return stage ? { ...next, stages: { ...current.stages, [edit.stageKey]: { ...stage, started: true, fields: { ...stage.fields, [edit.field]: value } } } } : next
      }
      return {
        ...next,
        lines: current.lines.map((entry) => {
          if (entry.id !== line?.id) return entry
          if (edit.target === 'line') return { ...entry, [edit.field]: value }
          const section = edit.section ?? 'production'
          return { ...entry, specs: { ...entry.specs, [section]: { ...(entry.specs?.[section] ?? {}), [edit.field]: String(value ?? '') } } }
        }),
      }
    })
    refresh()
    return true
  }

  const renderCell = (column: SheetColumn, input: CellInput) => {
    const display = column.render(input)
    if (!column.edit) return display
    return (
      <InlineCell
        display={display}
        value={column.edit.get(input)}
        kind={column.edit.kind}
        options={column.edit.options}
        locked={column.edit.locked?.(input) ?? null}
        align={column.align}
        onSave={(next) => saveCell(column.edit!, input, next)}
      />
    )
  }

  return { saveCell, renderCell }
}
