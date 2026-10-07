"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { setStageOverrides, type StageOverride } from '../lib/stages'

let loading: Promise<void> | null = null
let version = 0
const listeners = new Set<(value: number) => void>()

function load(): Promise<void> {
  if (!loading) {
    loading = apiCall<{ overrides?: StageOverride[] }>('/api/cc_orders/stage-settings', undefined, { fallback: { overrides: [] } }).then((call) => {
      if (!call.ok) loading = null
      setStageOverrides(call.result?.overrides ?? [])
      version += 1
      for (const listener of listeners) listener(version)
    })
  }
  return loading
}

export function reloadStageSettings(): Promise<void> {
  loading = null
  return load()
}

export function useStageSettings(): number {
  const [current, setCurrent] = React.useState(version)
  React.useEffect(() => {
    listeners.add(setCurrent)
    void load()
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}
