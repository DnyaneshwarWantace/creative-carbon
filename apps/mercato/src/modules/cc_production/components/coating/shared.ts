"use client"

import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { CoatingRow, CoatingSlot } from '../../data/entities'
import type { SheetFigures } from '../../lib/coatingFigures'

export type { CoatingRow, CoatingSlot, SheetFigures }

export type CoatingSetup = {
  dryers: Array<{ id: string; code: string; kind: string }>
  cloths: Array<{ id: string; title: string; gsm: number | null; free: number }>
  resinLots: Array<{ lotId: string; lotNumber: string | null; productId: string; title: string; grade: string | null; free: number; batchId: string | null }>
  slots: string[]
  bands: { rc: { min: number; max: number }; vc: { min: number; max: number } }
}

export type SheetRowView = CoatingRow & { plannedBstageKg: number | null; plannedResinKg: number | null; consumedKg: number | null; bstageLeftKg: number | null }

export type SheetView = {
  id: string
  sheetDate: string
  dryerId: string
  dryerCode: string
  status: 'draft' | 'posted'
  rows: SheetRowView[]
  slots: CoatingSlot[]
  figures: SheetFigures
  warnings: string[]
  notes: string | null
  issueIds: string[]
  postedAt: string | null
  postedByName: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  updatedAt: string
}

export type SheetListItem = { id: string; sheetDate: string; dryerId: string; dryerCode: string; status: 'draft' | 'posted'; rows: number; rawTotal: number; nosTotal: number; outputTotal: number; warnings: number; updatedAt: string }

export const SHEET_STATUS: Record<'draft' | 'posted', { label: string; variant: StatusBadgeVariant }> = {
  draft: { label: 'Not posted', variant: 'warning' },
  posted: { label: 'Posted', variant: 'success' },
}

export function paperTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const twelve = hours > 12 ? hours - 12 : hours
  return `${twelve}.${String(minutes).padStart(2, '0')}`
}
