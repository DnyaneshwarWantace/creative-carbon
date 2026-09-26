"use client"

import * as React from 'react'
import { Lock } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { EditField } from '../../dermat_products/components/EditField'
import type { CellEdit, CellInput, SheetColumn, SheetOrder } from './orderBookColumns'

type Options = {
  contextId: string
  patchOrder: (orderId: string, mutate: (order: SheetOrder) => SheetOrder) => void
  refresh: () => void
}

type Draft = { edit: CellEdit; input: CellInput; value: string }

function cellKey(edit: CellEdit, input: CellInput): string {
  return [input.order.id, edit.target === 'order' || edit.target === 'stage' ? '' : (input.line?.id ?? ''), edit.target, edit.section ?? '', edit.stageKey ?? '', edit.field].join('|')
}

function toValue(edit: CellEdit, raw: string): string | number | null {
  if (edit.kind === 'number') return raw.trim() === '' ? null : Number(raw)
  return raw
}

export function useCellEditor({ contextId, patchOrder, refresh }: Options) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId })
  const [editing, setEditing] = React.useState(false)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [saving, setSaving] = React.useState(false)
  const versions = React.useRef<Record<string, string>>({})

  const post = async (orderId: string, url: string, body: Record<string, unknown>, fallbackVersion: string) => {
    const version = versions.current[orderId] ?? fallbackVersion
    const call = await runMutation({
      context: { orderId, url },
      mutationPayload: body,
      operation: () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(version), () =>
          apiCall<{ updatedAt?: string; error?: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ),
    })
    if (call.ok && call.result?.updatedAt) versions.current[orderId] = call.result.updatedAt
    const conflict = call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
    return {
      ok: call.ok,
      error: call.ok ? null : conflict ? t('dermat_orders.errors.conflict', 'Someone else changed this order. Reload to see the latest.') : (call.result?.error ?? t('dermat_orders.book.cellError', 'Could not save the change.')),
    }
  }

  const applyLocal = (draft: Draft) => {
    const { edit, input } = draft
    const value = toValue(edit, draft.value)
    patchOrder(input.order.id, (current) => {
      const next: SheetOrder = { ...current, updatedAt: versions.current[current.id] ?? current.updatedAt }
      if (edit.target === 'order') return { ...next, [edit.field]: value } as SheetOrder
      if (edit.target === 'stage' && edit.stageKey) {
        const stage = current.stages[edit.stageKey]
        return stage ? { ...next, stages: { ...current.stages, [edit.stageKey]: { ...stage, started: true, fields: { ...stage.fields, [edit.field]: value } } } } : next
      }
      return {
        ...next,
        lines: current.lines.map((entry) => {
          if (entry.id !== input.line?.id) return entry
          if (edit.target === 'line') return { ...entry, [edit.field]: value }
          const section = edit.section ?? 'production'
          return { ...entry, specs: { ...entry.specs, [section]: { ...(entry.specs?.[section] ?? {}), [edit.field]: String(value ?? '') } } }
        }),
      }
    })
  }

  const saveAll = async () => {
    const list = Object.entries(drafts)
    if (!list.length) {
      setEditing(false)
      return
    }
    for (const [, draft] of list) {
      if (draft.edit.kind === 'number' && draft.value.trim() !== '' && !Number.isFinite(Number(draft.value))) {
        flash(t('dermat_orders.book.notNumber', 'Enter a number'), 'error')
        return
      }
    }
    setSaving(true)
    versions.current = {}
    const failed: Record<string, Draft> = {}
    const errors: string[] = []
    let saved = 0
    const stageGroups = new Map<string, Array<[string, Draft]>>()
    const single: Array<[string, Draft]> = []
    for (const entry of list) {
      const draft = entry[1]
      if (draft.edit.target === 'stage') {
        const group = `${draft.input.order.id}|${draft.edit.stageKey}`
        stageGroups.set(group, [...(stageGroups.get(group) ?? []), entry])
      } else single.push(entry)
    }
    for (const [key, draft] of single) {
      const { edit, input } = draft
      const result = await post(input.order.id, '/api/dermat_orders/orders/cell', { orderId: input.order.id, target: edit.target, lineId: input.line?.id, section: edit.section, field: edit.field, value: toValue(edit, draft.value) }, input.order.updatedAt)
      if (result.ok) {
        saved += 1
        applyLocal(draft)
      } else {
        failed[key] = draft
        errors.push(`${input.order.orderNo}: ${result.error}`)
      }
    }
    for (const entries of stageGroups.values()) {
      const first = entries[0][1]
      const data = Object.fromEntries(entries.map(([, draft]) => [draft.edit.field, toValue(draft.edit, draft.value)]))
      const result = await post(first.input.order.id, '/api/dermat_orders/orders/stage', { orderId: first.input.order.id, stageKey: first.edit.stageKey, action: 'save', data }, first.input.order.updatedAt)
      if (result.ok) {
        saved += entries.length
        entries.forEach(([, draft]) => applyLocal(draft))
      } else {
        entries.forEach(([key, draft]) => {
          failed[key] = draft
        })
        errors.push(`${first.input.order.orderNo}: ${result.error}`)
      }
    }
    setSaving(false)
    setDrafts(failed)
    if (errors.length) {
      flash(`${t('dermat_orders.book.savedSome', '{saved} saved, {failed} not saved.', { saved, failed: Object.keys(failed).length })} ${errors.slice(0, 3).join(' · ')}`, 'error')
    } else {
      flash(t('dermat_orders.book.savedAll', '{count} changes saved', { count: saved }), 'success')
      setEditing(false)
    }
    refresh()
  }

  const renderCell = (column: SheetColumn, input: CellInput) => {
    const display = column.render(input)
    const edit = column.edit
    if (!edit || !editing) return display
    const locked = edit.locked?.(input) ?? null
    if (locked) {
      return (
        <span title={locked} className="inline-flex items-center gap-1 text-muted-foreground">
          {display}
          <Lock className="h-3 w-3 shrink-0" aria-label={locked} />
        </span>
      )
    }
    const key = cellKey(edit, input)
    const original = edit.get(input)
    const draft = drafts[key]
    return (
      <EditField
        kind={edit.kind}
        options={edit.options}
        listKey={edit.listKey}
        align={column.align}
        value={draft ? draft.value : original}
        dirty={Boolean(draft)}
        onChange={(value) =>
          setDrafts((prev) => {
            const next = { ...prev }
            if (value === original) delete next[key]
            else next[key] = { edit, input, value }
            return next
          })
        }
      />
    )
  }

  return {
    editing,
    saving,
    dirtyCount: Object.keys(drafts).length,
    startEditing: () => setEditing(true),
    cancelEditing: () => {
      setDrafts({})
      setEditing(false)
    },
    saveAll,
    renderCell,
  }
}
