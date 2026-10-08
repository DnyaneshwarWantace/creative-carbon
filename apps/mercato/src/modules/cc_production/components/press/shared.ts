"use client"

import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { PressDaylight, PressOutput, PressPick } from '../../data/entities'

export type { PressDaylight, PressOutput, PressPick }

export type SizeLine = { grade: string; thicknessMm: number; count: number; kg: number }

export type PressSetup = {
  nextBatchNo: string | null
  presses: Array<{ id: string; number: number; pressType: string; daylights: number | null; isWorking: boolean }>
  tolerances: Array<{ thicknessMm: number; minKg: number; maxKg: number }>
  grades: string[]
  lots: Array<{ lotId: string; lotNumber: string; clothTitle: string | null; gsm: number | null; freeKg: number; ageDays: number; band: string; madeOn: string; grades: string[] }>
}

export type PressFigures = { sizeLines: SizeLine[]; paperLines: string[]; totalSheets: number; totalKg: number; kgByGrade: Record<string, number> }

export type PressBatchView = {
  id: string
  batchNo: string
  batchDate: string
  pressId: string
  pressNumber: number
  cycleNo: number | null
  daylights: PressDaylight[]
  lotChoices: Array<{ grade: string; lotId: string; reason: string }>
  picks: PressPick[]
  outputs: Array<PressOutput & { leftKg: number | null }>
  heating: Record<string, string | number | null> | null
  warnings: string[]
  figures: PressFigures
  checkedBy: string | null
  remark: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  status: 'draft' | 'posted' | 'cancelled'
  cancelReason: string | null
  postedAt: string | null
  postedByName: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  updatedAt: string
}

export type PressBatchRow = {
  id: string
  batchNo: string
  seq: number
  batchDate: string
  pressId: string
  pressNumber: number
  status: 'draft' | 'posted' | 'cancelled'
  grades: string[]
  paperLines: string[]
  sizeLines: SizeLine[]
  totalSheets: number
  totalKg: number
  warnings: number
  checkedBy: string | null
  remark: string | null
  reviewedBy: string | null
  updatedAt: string
}

export const PRESS_STATUS: Record<'draft' | 'posted' | 'cancelled', { label: string; variant: StatusBadgeVariant }> = {
  draft: { label: 'Not posted', variant: 'warning' },
  posted: { label: 'Posted', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export const HEATING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'hydraulicPressure', label: 'Hydraulic pressure' },
  { key: 'formingStart', label: 'Forming start time' },
  { key: 'formingComplete', label: 'Forming complete time' },
  { key: 'steamStart', label: 'Steam start time' },
  { key: 'temp120At', label: '120 temperature' },
  { key: 'maxTempAt', label: 'Maximum temperature (150)' },
  { key: 'soakingTime', label: 'Socking time' },
  { key: 'cbtMaxTemp', label: 'CBT maximum temp' },
  { key: 'coolingStart', label: 'Cooling start time' },
  { key: 'coolingStop', label: 'Cooling stop' },
  { key: 'totalTime', label: 'Total time' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'inchargeSign', label: 'Incharge sign' },
  { key: 'operatorSign', label: 'Operator sign' },
]

export function parseWeight(text: string): { weightKg: number | null; weightMinKg: number | null } {
  const parts = text
    .split('/')
    .map((part) => part.trim().replace(/,/g, ''))
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!parts.length) return { weightKg: null, weightMinKg: null }
  if (parts.length === 1) return { weightKg: parts[0], weightMinKg: null }
  return { weightKg: Math.max(...parts), weightMinKg: Math.min(...parts) }
}

export function weightText(sheet: { weightKg: number; weightMinKg: number | null }): string {
  const format = (value: number) => value.toFixed(3)
  return sheet.weightMinKg !== null ? `${format(sheet.weightMinKg)}/${format(sheet.weightKg)}` : format(sheet.weightKg)
}
