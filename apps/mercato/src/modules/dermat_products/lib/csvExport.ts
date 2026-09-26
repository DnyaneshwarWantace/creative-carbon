import { serializeExport } from '@open-mercato/shared/lib/crud/exporters'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type CsvColumn<T> = { header: string; value: (row: T) => unknown }

export function csvFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
}

export function downloadCsv<T>(name: string, columns: CsvColumn<T>[], rows: T[]): void {
  if (typeof window === 'undefined') return
  const prepared = {
    columns: columns.map((column, index) => ({ field: `c${index}`, header: column.header })),
    rows: rows.map((row) => Object.fromEntries(columns.map((column, index) => [`c${index}`, column.value(row)]))),
  }
  const serialized = serializeExport(prepared, 'csv')
  const blob = new Blob(['﻿', serialized.body], { type: serialized.contentType })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = csvFileName(name)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(href)
}

export function openServerExport(url: string): void {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
}

export async function fetchAllPages<T>(url: string, pageSize = 100, maxPages = 50): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= maxPages; page += 1) {
    const joiner = url.includes('?') ? '&' : '?'
    const call = await apiCall<{ items?: T[]; totalPages?: number; total?: number }>(`${url}${joiner}page=${page}&pageSize=${pageSize}`, undefined, { fallback: { items: [] } })
    if (!call.ok) throw new Error('[internal] export load failed')
    const batch = call.result?.items ?? []
    items.push(...batch)
    const totalPages = call.result?.totalPages ?? (call.result?.total != null ? Math.ceil(call.result.total / pageSize) : null)
    if (batch.length < pageSize || (totalPages != null && page >= totalPages)) break
  }
  return items
}

export async function fetchDetails<T>(ids: string[], urlFor: (id: string) => string, concurrency = 6): Promise<T[]> {
  const results: T[] = new Array(ids.length)
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const index = next
      next += 1
      const call = await apiCall<T>(urlFor(ids[index]))
      if (!call.ok || !call.result) throw new Error('[internal] export detail load failed')
      results[index] = call.result
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return results
}
