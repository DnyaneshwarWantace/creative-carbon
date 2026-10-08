"use client"

import * as React from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

const STORAGE_KEY = 'cc-offline-queue'
const EVENT = 'cc-offline-queue-changed'

export type QueuedSave = { id: string; screen: string; recordRef: string; path: string; method: 'POST' | 'PUT'; body: Record<string, unknown>; updatedAt: string | null; queuedAt: string }

function readQueue(): QueuedSave[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as QueuedSave[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedSave[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    return
  }
  window.dispatchEvent(new Event(EVENT))
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function queueSave(entry: Omit<QueuedSave, 'id' | 'queuedAt'>) {
  const queue = readQueue().filter((item) => !(item.path === entry.path && item.recordRef === entry.recordRef))
  queue.push({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: new Date().toISOString() })
  writeQueue(queue)
}

async function sendOne(entry: QueuedSave, withLock: boolean) {
  return withScopedApiRequestHeaders(withLock && entry.updatedAt ? buildOptimisticLockHeader(entry.updatedAt) : {}, () =>
    apiCall<{ error?: string }>(entry.path, { method: entry.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry.body) }),
  )
}

export async function flushQueue(): Promise<{ sent: number; clashes: number; failed: number }> {
  let sent = 0
  let clashes = 0
  let failed = 0
  for (const entry of readQueue()) {
    if (isOffline()) break
    let call = await sendOne(entry, true)
    if (call.status === 409) {
      clashes += 1
      await apiCall('/api/cc_production/clash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ screen: entry.screen, recordRef: entry.recordRef, detail: `Saved offline at ${new Date(entry.queuedAt).toLocaleString('en-IN')}; someone else changed it before it synced. The offline save was kept (last save wins).` }) })
      call = await sendOne(entry, false)
    }
    if (call.ok && !call.result?.error) {
      sent += 1
      writeQueue(readQueue().filter((item) => item.id !== entry.id))
    } else if (call.status && call.status < 500) {
      failed += 1
      writeQueue(readQueue().filter((item) => item.id !== entry.id))
      flash(`${entry.screen}: ${call.result?.error ?? 'the offline save was refused'}`, 'error')
    } else break
  }
  return { sent, clashes, failed }
}

export function usePlantPwa() {
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = '/cc-manifest.webmanifest'
      document.head.appendChild(link)
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = '#8a3b2e'
      document.head.appendChild(meta)
    }
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/cc-sw.js').catch(() => undefined)
  }, [])
}

export function OfflineBadge({ onSynced }: { onSynced?: () => void }) {
  const t = useT()
  usePlantPwa()
  const [pending, setPending] = React.useState(0)
  const [offline, setOffline] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const onSyncedRef = React.useRef(onSynced)
  onSyncedRef.current = onSynced

  const sync = React.useCallback(async () => {
    if (isOffline() || !readQueue().length) return
    setSyncing(true)
    try {
      const result = await flushQueue()
      if (result.sent) {
        flash(result.clashes ? t('cc_production.offline.syncedClash', 'Synced {count} saves; {clashes} had been changed by someone else (kept yours, owner told).', { count: result.sent, clashes: result.clashes }) : t('cc_production.offline.synced', 'Synced {count} saves made offline.', { count: result.sent }), 'success')
        onSyncedRef.current?.()
      }
    } finally {
      setSyncing(false)
      setPending(readQueue().length)
    }
  }, [t])

  React.useEffect(() => {
    const refresh = () => {
      setPending(readQueue().length)
      setOffline(isOffline())
    }
    const online = () => {
      refresh()
      void sync()
    }
    refresh()
    void sync()
    window.addEventListener(EVENT, refresh)
    window.addEventListener('online', online)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', refresh)
    }
  }, [sync])

  if (!pending && !offline) return null
  return (
    <button
      type="button"
      onClick={() => void sync()}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', offline ? 'border-status-warning-border bg-status-warning-bg text-status-warning-text' : 'border-border bg-muted text-foreground')}
    >
      {offline ? <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> : <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} aria-hidden="true" />}
      {offline ? t('cc_production.offline.offline', 'Offline') : null}
      {pending ? ` · ${t('cc_production.offline.waiting', '{count} waiting to sync', { count: pending })}` : null}
    </button>
  )
}
