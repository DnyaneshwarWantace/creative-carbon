"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { listDefaults } from '../lib/lists'

type ListPayload = { items?: Array<{ key: string; options: Array<{ value: string; active: boolean }> }> }

let cache: Promise<Map<string, string[]>> | null = null
const listeners = new Set<() => void>()

function loadAll(): Promise<Map<string, string[]>> {
  if (!cache) {
    cache = apiCall<ListPayload>('/api/dermat_lists/lists', undefined, { fallback: { items: [] } }).then((call) => {
      const map = new Map<string, string[]>()
      for (const list of call.result?.items ?? []) map.set(list.key, list.options.filter((option) => option.active).map((option) => option.value))
      if (!call.ok) cache = null
      return map
    })
  }
  return cache
}

export function invalidateListOptions(): void {
  cache = null
  for (const listener of listeners) listener()
}

export function useListOptions(key: string, current?: string | null): string[] {
  const [options, setOptions] = React.useState<string[]>(() => listDefaults(key))
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    const listener = () => setVersion((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void loadAll().then((map) => {
      if (!cancelled && map.has(key)) setOptions(map.get(key) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [key, version])

  return React.useMemo(() => (current && !options.includes(current) ? [...options, current] : options), [current, options])
}
