"use client"

import * as React from 'react'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

export type FloorLot = {
  lotId: string
  lotNumber: string
  productId: string
  title: string
  kind: string
  unit: string
  place: string
  placeLabel: string
  status: string
  onHand: number
  free: number
  nos: number | null
  nosLeft: number | null
  madeKg: number | null
  thicknessMm: number | null
  grade: string | null
  batchNo: string | null
  cutSize: string | null
  articleWeightKg: number | null
  madeOn: string | null
}

export type FinishingSetup = { floorLots: FloorLot[]; cutSizes: string[]; rejectionReasons: string[]; testTypes: string[]; standards: string[]; trimBand: { laminate: { min: number; max: number }; moulded: { min: number; max: number } } }

export function lotLabel(lot: FloorLot): string {
  const pieces = lot.nosLeft !== null ? ` · ${lot.nosLeft} ${lot.unit === 'nos' ? 'pcs' : 'sheets'}` : ''
  const size = lot.thicknessMm ? ` · ${lot.thicknessMm} mm` : ''
  return `${lot.lotNumber} · ${lot.title}${size}${pieces}${lot.unit === 'nos' ? '' : ` · ${lot.free} kg`}${lot.status !== 'available' ? ` · ${lot.status.toUpperCase()}` : ''}`
}

export function useSetup() {
  const [setup, setSetup] = React.useState<FinishingSetup | null>(null)
  const reload = React.useCallback(async () => {
    const call = await apiCall<FinishingSetup>('/api/cc_production/finishing/setup')
    if (call.result) setSetup(call.result)
  }, [])
  React.useEffect(() => {
    void reload()
  }, [reload])
  return { setup, reload }
}

export function useSend(contextId: string) {
  const { runMutation } = useGuardedMutation({ contextId })
  return React.useCallback(
    async <T,>(path: string, method: 'POST' | 'PUT', body: Record<string, unknown>, updatedAt?: string | null, failMessage = 'Could not save.'): Promise<T | null> => {
      const call = await runMutation({
        context: {},
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(updatedAt ? buildOptimisticLockHeader(updatedAt) : {}, () =>
            apiCall<T & { error?: string }>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || (call.result as { error?: string }).error) {
        flash((call.result as { error?: string } | null)?.error ?? failMessage, 'error')
        return null
      }
      return call.result
    },
    [runMutation],
  )
}

export const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
