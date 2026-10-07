import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'

export type KeyValueRow = { label: string; value: React.ReactNode; wide?: boolean }

export function KeyValueList({ rows, className }: { rows: KeyValueRow[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2', className)}>
      {rows.map((row) => (
        <div key={row.label} className={cn('flex min-w-0 flex-col', row.wide && 'sm:col-span-2')}>
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="whitespace-pre-line break-words">{row.value === null || row.value === undefined || row.value === '' ? '—' : row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
