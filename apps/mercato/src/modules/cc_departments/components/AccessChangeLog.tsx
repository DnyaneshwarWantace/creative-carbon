"use client"

import * as React from 'react'
import { History, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'

type Change = { field: string; label: string; from: string | number | boolean | null; to: string | number | boolean | null }
export type AccessChangeRow = {
  id: string
  subjectType: 'role' | 'user'
  subjectId: string
  subjectLabel: string
  action: string
  changes: Change[]
  reason: string | null
  outside: boolean
  by: string | null
  at: string
  undoOf: string | null
  undoneAt: string | null
  undoneByName: string | null
  canUndo: boolean
  restore: { superAdmin: boolean; features: string[] | null; roles: string[] | null } | null
}

const ACTION_LABEL: Record<string, string> = {
  person_added: 'Person added',
  person_removed: 'Person removed',
  right_granted: 'Right granted',
  right_removed: 'Right removed',
  rights_changed: 'Rights changed',
  department_changed: 'Department changed',
  password_reset: 'Password reset',
  changed_elsewhere: 'Changed outside this page',
  undone: 'Undo of an earlier change',
  changed: 'Changed',
}

function shown(value: Change['from']): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export async function logAccess(subjectType: 'role' | 'user', subjectId: string, phase: 'before' | 'after', extra: { reason?: string | null; undoOf?: string | null } = {}) {
  return apiCall<{ change: AccessChangeRow | null; error?: string }>('/api/cc_departments/access-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subjectType, subjectId, phase, ...extra }) })
}

export function AccessChangeLog({ subjectType, subjectId, refreshKey, onUndone }: { subjectType?: 'role' | 'user'; subjectId?: string; refreshKey?: unknown; onUndone?: () => void }) {
  const t = useT()
  const [items, setItems] = React.useState<AccessChangeRow[] | null>(null)
  const [undoing, setUndoing] = React.useState<AccessChangeRow | null>(null)
  const load = React.useCallback(async () => {
    const query = new URLSearchParams()
    if (subjectType) query.set('subjectType', subjectType)
    if (subjectId) query.set('subjectId', subjectId)
    const call = await apiCall<{ items: AccessChangeRow[] }>(`/api/cc_departments/access-log?${query.toString()}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [subjectId, subjectType])
  React.useEffect(() => {
    void load()
  }, [load, refreshKey])

  const undo = async (row: AccessChangeRow, reason: string): Promise<boolean> => {
    if (!row.restore) return false
    const reasonHeader = { 'x-cc-reason': encodeURIComponent(reason), 'x-cc-undo-of': row.id }
    if (row.subjectType === 'role') {
      const current = await apiCall<{ updatedAt: string | null }>(`/api/auth/roles/acl?roleId=${row.subjectId}`)
      await logAccess('role', row.subjectId, 'before')
      const call = await withScopedApiRequestHeaders(current.result?.updatedAt ? buildOptimisticLockHeader(current.result.updatedAt) : {}, () =>
        apiCall<{ error?: string }>('/api/auth/roles/acl', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleId: row.subjectId, features: row.restore?.features ?? [], isSuperAdmin: row.restore?.superAdmin ?? false }) }),
      )
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_departments.log.undoFailed', 'Could not put the rights back.'), 'error')
        return false
      }
      const logged = await logAccess('role', row.subjectId, 'after', { reason, undoOf: row.id })
      if (!logged.ok) {
        flash(logged.result?.error ?? t('cc_departments.log.undoFailed', 'Could not put the rights back.'), 'error')
        return false
      }
    } else {
      await logAccess('user', row.subjectId, 'before')
      const roleChanged = row.changes.some((change) => change.field.startsWith('role:'))
      if (roleChanged && row.restore.roles) {
        const person = await apiCall<{ items?: Array<{ updatedAt?: string | null }> }>(`/api/auth/users?id=${row.subjectId}&pageSize=1`)
        const version = person.result?.items?.[0]?.updatedAt ?? null
        const call = await withScopedApiRequestHeaders({ ...(version ? buildOptimisticLockHeader(version) : {}), ...reasonHeader }, () =>
          apiCall<{ error?: string }>('/api/auth/users', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.subjectId, roles: row.restore?.roles ?? [] }) }),
        )
        if (!call.ok) {
          flash(call.result?.error ?? t('cc_departments.log.undoFailed', 'Could not put the rights back.'), 'error')
          return false
        }
      }
      if (row.changes.some((change) => change.field.startsWith('feature:') || change.field === 'personal' || change.field === 'superAdmin')) {
        const call = await apiCall<{ error?: string }>('/api/auth/users/acl', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: row.subjectId, features: row.restore.features ?? [] }) })
        if (!call.ok) {
          flash(call.result?.error ?? t('cc_departments.log.undoFailed', 'Could not put the rights back.'), 'error')
          return false
        }
        await logAccess('user', row.subjectId, 'after', { reason, undoOf: row.id })
      }
    }
    flash(t('cc_departments.log.undone', 'Access put back as it was.'), 'success')
    await load()
    onUndone?.()
    return true
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t('cc_departments.log.title', 'Access change log')}
      </h2>
      {!items ? null : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('cc_departments.log.none', 'No access changes logged yet.')}</p>
      ) : (
        <ul className="divide-y">
          {items.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm">
                  <span className="font-medium">{row.subjectLabel}</span> · {t(`cc_departments.log.action.${row.action}`, ACTION_LABEL[row.action] ?? row.action)}
                  {row.undoneAt ? <StatusBadge variant="neutral" className="ml-2">{t('cc_departments.log.undoneBadge', 'Undone')}</StatusBadge> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {row.outside ? t('cc_departments.log.outside', 'found on the next visit') : row.by ?? '—'}
                  {row.reason ? ` · ${row.reason}` : ''}
                </p>
                <p className="text-xs">{row.changes.slice(0, 6).map((change) => `${change.label}: ${shown(change.from)} → ${shown(change.to)}`).join(' · ')}{row.changes.length > 6 ? ` +${row.changes.length - 6}` : ''}</p>
              </div>
              {row.canUndo ? (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setUndoing(row)}>
                  <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_departments.log.undo', 'Undo')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <CorrectDialog
        open={Boolean(undoing)}
        onOpenChange={(open) => !open && setUndoing(null)}
        title={t('cc_departments.log.undoTitle', 'Put the access back as it was')}
        confirmLabel={t('cc_departments.log.undo', 'Undo')}
        undo={undoing ? undoing.changes.slice(0, 10).map((change) => `${change.label}: ${shown(change.to)} → ${shown(change.from)}`) : []}
        onConfirm={(reason) => (undoing ? undo(undoing, reason) : Promise.resolve(false))}
      />
    </section>
  )
}
